const db = require("../config/db");

function parseInstanceId(instanceIdStr) {
  // "1-3" -> [1,3] 로 바꿔줌
  if (typeof instanceIdStr !== "string") return null;
  const parts = instanceIdStr.split("-");
  if (parts.length !== 2) return null;
  const bookId = Number(parts[0]);
  const copyNumber = Number(parts[1]);
  if (Number.isNaN(bookId) || Number.isNaN(copyNumber)) return null;
  return { bookId, copyNumber };
}

const getBooksPage = async (req, res, next) => {
  const { query: searchQuery, searchBy } = req.query;
  const sortBy = req.query.sortBy || "title";
  const sortOrder =
    (req.query.sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  try {
    // book -> book_category -> category 조인하여 카테고리 집계
    let whereClauses = [];
    let params = [];
    if (searchQuery) {
      if (searchBy === "author") {
        params.push(`%${searchQuery}%`);
        whereClauses.push(`b.author ILIKE $${params.length}`);
      } else if (searchBy === "category") {
        params.push(`%${searchQuery}%`);
        whereClauses.push(`c.category_name ILIKE $${params.length}`);
      } else {
        // title로 검색 (기본)
        params.push(`%${searchQuery}%`);
        whereClauses.push(`b.title ILIKE $${params.length}`);
      }
    }

    const whereSQL = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const allowedSort = {
      title: "b.title",
      author: "b.author",
      categories: "categories",
    };
    const orderBy = allowedSort[sortBy] || "b.title";

    const sql = `
            SELECT b.book_id AS id,
                   b.title,
                   b.author,
                   COALESCE(string_agg(distinct c.category_name, ', '), '') AS categories,
                   b.total_count AS total_quantity,
                   b.remain_count AS available_quantity
            FROM book b
            LEFT JOIN book_category bc ON b.book_id = bc.book_id
            LEFT JOIN category c ON bc.category_id = c.category_id
            ${whereSQL}
            GROUP BY b.book_id
            ORDER BY ${orderBy} ${sortOrder}
        `;

    const { rows: books } = await db.query(sql, params);

    res.render("pages/books", {
      title: "All Books",
      books,
      sortBy,
      sortOrder: sortOrder === "DESC" ? "desc" : "asc",
      query: searchQuery,
      searchBy,
    });
  } catch (err) {
    next(err);
  }
};

const getAddBookPage = async (req, res, next) => {
  try {
    // 카테고리 가져오기
    const { rows: categories } = await db.query(
      "SELECT category_id AS id, category_name AS name FROM category ORDER BY category_name"
    );

    // authors 목록
    const { rows: authorRows } = await db.query(
      `SELECT DISTINCT author AS name FROM book ORDER BY author`
    );

    // authors 목록을 가져와서 각 author의 id와 name을 매핑
    const authors = authorRows.map((r) => ({ id: r.name, name: r.name }));

    res.render("pages/add-book", {
      title: "Add New Book",
      categories,
      authors,
    });
  } catch (err) {
    next(err);
  }
};

const postAddBook = async (req, res, next) => {
  let { title, authors: authorInput, quantity, categories } = req.body;
  quantity = Number(quantity) || 1;
  // 카테고리는 undefined, string, array 중 하나
  if (!categories) categories = [];
  else if (!Array.isArray(categories)) categories = [categories];

  try {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      let authorName = "";
      if (typeof authorInput === "string" && authorInput.startsWith("id:")) {
        authorName = authorInput.slice(3);
      } else if (typeof authorInput === "string") {
        authorName = authorInput;
      } else {
        authorName = String(authorInput || "Unknown");
      }

      // 책 존재하는지 확인
      const { rows: existing } = await client.query(
        "SELECT * FROM book WHERE title = $1 AND author = $2",
        [title, authorName]
      );

      let bookId;
      if (existing.length > 0) {
        // 책이 존재하면 count를 늘리고 복사본도 추가
        bookId = existing[0].book_id;
        await client.query(
          "UPDATE book SET total_count = total_count + $1, remain_count = remain_count + $1 WHERE book_id = $2",
          [quantity, bookId]
        );

        // 현재 copy_number의 최대 찾음
        const { rows: maxRow } = await client.query(
          "SELECT COALESCE(MAX(copy_number), 0) AS max_copy FROM book_copy WHERE book_id = $1",
          [bookId]
        );
        let start = Number(maxRow[0].max_copy) + 1;
        for (let i = 0; i < quantity; i++) {
          await client.query(
            "INSERT INTO book_copy (book_id, copy_number, status) VALUES ($1, $2, $3)",
            [bookId, start + i, true]
          );
        }
      } else {
        // new book
        const { rows: inserted } = await client.query(
          "INSERT INTO book (title, author, total_count, remain_count) VALUES ($1, $2, $3, $3) RETURNING book_id",
          [title, authorName, quantity]
        );
        bookId = inserted[0].book_id;

        // add copies
        for (let i = 1; i <= quantity; i++) {
          await client.query(
            "INSERT INTO book_copy (book_id, copy_number, status) VALUES ($1, $2, $3)",
            [bookId, i, true]
          );
        }
      }

      for (const catInput of categories) {
        let categoryId = null;
        if (typeof catInput === "string" && catInput.startsWith("id:")) {
          const candidate = catInput.slice(3);
          const asNum = Number(candidate);
          if (!Number.isNaN(asNum)) {
            categoryId = asNum;
          } else {
            const name = candidate;
            const { rows: found } = await client.query(
              "SELECT category_id FROM category WHERE category_name = $1",
              [name]
            );
            if (found.length > 0) categoryId = found[0].category_id;
            else {
              const { rows: ins } = await client.query(
                "INSERT INTO category (category_name) VALUES ($1) RETURNING category_id",
                [name]
              );
              categoryId = ins[0].category_id;
            }
          }
        } else if (typeof catInput === "string") {
          const name = catInput;
          const { rows: found } = await client.query(
            "SELECT category_id FROM category WHERE category_name = $1",
            [name]
          );
          if (found.length > 0) categoryId = found[0].category_id;
          else {
            const { rows: ins } = await client.query(
              "INSERT INTO category (category_name) VALUES ($1) RETURNING category_id",
              [name]
            );
            categoryId = ins[0].category_id;
          }
        }

        if (categoryId) {
          // 존재하지 않으면 book_category에 삽입
          await client.query(
            `INSERT INTO book_category (book_id, category_id)
                         VALUES ($1, $2)
                         ON CONFLICT (book_id, category_id) DO NOTHING`,
            [bookId, categoryId]
          );
        }
      }

      await client.query("COMMIT");
      res.redirect("/books");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

// bookId-copyNumber 형식의 instance id를 받아서 해당 복사본을 삭제
const postDeleteBookInstance = async (req, res, next) => {
  const instanceId = req.params.id;
  const parsed = parseInstanceId(instanceId);
  if (!parsed) {
    const err = new Error("Invalid instance id");
    err.status = 400;
    return next(err);
  }
  const { bookId, copyNumber } = parsed;

  try {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // copy 삭제
      await client.query(
        "DELETE FROM book_copy WHERE book_id = $1 AND copy_number = $2",
        [bookId, copyNumber]
      );

      // total_count와 remain_count 감소
      await client.query(
        "UPDATE book SET total_count = GREATEST(total_count - 1, 0), remain_count = GREATEST(remain_count - 1, 0) WHERE book_id = $1",
        [bookId]
      );

      // 더이상 copy가 없으면 해당 행 삭제
      const { rows: remaining } = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM book_copy WHERE book_id = $1",
        [bookId]
      );
      if (remaining[0].cnt === 0) {
        await client.query("DELETE FROM book WHERE book_id = $1", [bookId]);
      }

      await client.query("COMMIT");
      res.redirect("/books");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const postBorrowBook = async (req, res, next) => {
  const instanceId = req.params.id;
  const parsed = parseInstanceId(instanceId);
  const userId = req.session.userId;

  if (!userId) return res.redirect("/login");
  if (!parsed) {
    const err = new Error("Invalid instance id");
    err.status = 400;
    return next(err);
  }
  const { bookId, copyNumber } = parsed;

  try {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // 유저의 대출 여부 확인
      const { rows: activeRows } = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM loan WHERE user_id = $1 AND return_date IS NULL",
        [userId]
      );
      if (activeRows[0].cnt >= 3) {
        const err = new Error("최대 대출 권수(3) 초과.");
        err.status = 400;
        await client.query("ROLLBACK");
        return next(err);
      }

      // 같은 책은 1권만 빌릴 수 있음
      const { rows: sameBookActive } = await client.query(
        "SELECT 1 FROM loan WHERE user_id = $1 AND book_id = $2 AND return_date IS NULL LIMIT 1",
        [userId, bookId]
      );
      if (sameBookActive.length > 0) {
        const err = new Error("You already borrowed this book.");
        err.status = 400;
        await client.query("ROLLBACK");
        return next(err);
      }

      // lock the copy row
      const { rows: copyRows } = await client.query(
        "SELECT status FROM book_copy WHERE book_id = $1 AND copy_number = $2 FOR UPDATE",
        [bookId, copyNumber]
      );
      if (copyRows.length === 0) {
        const err = new Error("Book instance not found");
        err.status = 404;
        await client.query("ROLLBACK");
        return next(err);
      }
      if (!copyRows[0].status) {
        const err = new Error("Book instance is not available");
        err.status = 400;
        await client.query("ROLLBACK");
        return next(err);
      }

      // 대출 생성: due_date는 오늘로부터 7일로 설정
      const { rows: loanRows } = await client.query(
        `INSERT INTO loan (user_id, book_id, copy_number, borrow_date, due_date)
                 VALUES ($1, $2, $3, CURRENT_DATE, (CURRENT_DATE + INTERVAL '7 days'))
                 RETURNING loan_id`,
        [userId, bookId, copyNumber]
      );

      // copy를 사용 불가능로 표시
      await client.query(
        "UPDATE book_copy SET status = FALSE WHERE book_id = $1 AND copy_number = $2",
        [bookId, copyNumber]
      );

      // remain_count 감소
      await client.query(
        "UPDATE book SET remain_count = GREATEST(remain_count - 1, 0) WHERE book_id = $1",
        [bookId]
      );

      await client.query("COMMIT");
      res.redirect("/books");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const postReturnBook = async (req, res, next) => {
  const borrowingId = Number(req.params.id);
  const userId = req.session.userId;

  if (!userId) return res.redirect("/login");

  try {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      // 대출이 존재하고 유저 소유인지, 아직 반납되지 않았는지
      const { rows: loanRows } = await client.query(
        "SELECT loan_id, book_id, copy_number, due_date FROM loan WHERE loan_id = $1 AND user_id = $2 AND return_date IS NULL FOR UPDATE",
        [borrowingId, userId]
      );
      if (loanRows.length === 0) {
        const err = new Error("Borrowing record not found or not authorized");
        err.status = 400;
        await client.query("ROLLBACK");
        return next(err);
      }

      const {
        book_id: bookId,
        copy_number: copyNumber,
        due_date,
      } = loanRows[0];

      // return_date와 is_overdue 업데이트
      const { rows: updated } = await client.query(
        `UPDATE loan SET return_date = CURRENT_DATE, is_overdue = (CURRENT_DATE > due_date)
                 WHERE loan_id = $1 RETURNING *`,
        [borrowingId]
      );

      // copy를 사용 가능으로 표시
      await client.query(
        "UPDATE book_copy SET status = TRUE WHERE book_id = $1 AND copy_number = $2",
        [bookId, copyNumber]
      );

      // remain_count 증가
      await client.query(
        "UPDATE book SET remain_count = remain_count + 1 WHERE book_id = $1",
        [bookId]
      );

      await client.query("COMMIT");
      res.redirect("/borrowings");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

const getBookInstances = async (req, res, next) => {
  const bookId = Number(req.params.id);
  if (Number.isNaN(bookId)) {
    const err = new Error("Invalid book id");
    err.status = 400;
    return next(err);
  }

  try {
    // 책의 모든 복사본과 대출 상태 조회
    const sql = `
            SELECT bc.copy_number,
                   bc.status,
                   l.loan_id,
                   l.user_id AS borrowed_by_id,
                   u.username AS borrowed_by,
                   to_char(l.borrow_date, 'YYYY-MM-DD') AS borrow_date
            FROM book_copy bc
            LEFT JOIN loan l ON l.book_id = bc.book_id AND l.copy_number = bc.copy_number AND l.return_date IS NULL
            LEFT JOIN users u ON u.user_id = l.user_id
            WHERE bc.book_id = $1
            ORDER BY bc.copy_number
        `;

    const { rows } = await db.query(sql, [bookId]);

    const instances = rows.map((r) => ({
      id: `${bookId}-${r.copy_number}`,
      book_id: bookId,
      borrowing_id: r.loan_id || null,
      borrowed_by: r.borrowed_by || null,
      borrowed_by_id: r.borrowed_by_id || null,
      borrow_date: r.borrow_date || null,
      status: r.status ? "available" : "borrowed",
    }));

    res.json(instances);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBooksPage,
  getAddBookPage,
  postAddBook,
  postDeleteBookInstance,
  postBorrowBook,
  postReturnBook,
  getBookInstances,
};
