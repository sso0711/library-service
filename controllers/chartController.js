const db = require("../config/db");

const getChartsPage = async (req, res, next) => {
  let selectedCategoryId = req.query.categoryId
    ? Number(req.query.categoryId)
    : null;

  // const dummyPopularBooks = [ // 구현을 다하면 제거해주세요.
  //     { title: 'The Hobbit', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 10 },
  //     { title: 'The Lord of the Rings', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 8 },
  //     { title: 'Foundation', author: 'Isaac Asimov', categories: 'Science Fiction', borrow_count: 12 },
  //     { title: 'And Then There Were None', author: 'Agatha Christie', categories: 'Mystery', borrow_count: 15 },
  //     { title: 'Dune', author: 'Frank Herbert', categories: 'Science Fiction, Fantasy', borrow_count: 9 },
  //     { title: 'The Silmarillion', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 5 },
  // ];

  // const dummyPopularBooksByCategory = { // 구현을 다하면 제거해주세요.
  //     'Fantasy': [
  //         { title: 'The Hobbit', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 10 },
  //         { title: 'The Lord of the Rings', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 8 },
  //         { title: 'Dune', author: 'Frank Herbert', categories: 'Science Fiction, Fantasy', borrow_count: 9 },
  //         { title: 'The Silmarillion', author: 'J.R.R Tolkien', categories: 'Fantasy', borrow_count: 5 },
  //     ],
  // };

  // const dummyCategories = [ // 구현을 다하면 제거해주세요.
  //     { id: 1, name: 'Fantasy' },
  //     { id: 2, name: 'Science Fiction' },
  //     { id: 3, name: 'Mystery' },
  // ];

  try {
    /*
            TODO: 차트 페이지를 렌더링하는 코드를 작성하세요.
        */
    // 전체 인기 도서 (최근 3개월)
    const { rows: popularBooks } = await db.query(
      `SELECT 
          b.title,
          b.author,
          COALESCE(string_agg(DISTINCT c.category_name, ', '), '') AS categories,
          COUNT(DISTINCT l.loan_id) AS borrow_count
        FROM book b
        JOIN loan l ON l.book_id = b.book_id
        LEFT JOIN book_category bc ON bc.book_id = b.book_id
        LEFT JOIN category c ON c.category_id = bc.category_id
        WHERE l.borrow_date >= (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY b.book_id
        ORDER BY borrow_count DESC, b.title ASC
        LIMIT 50`
    );

    // 카테고리 목록
    const { rows: categories } = await db.query(
      `SELECT category_id AS id, category_name AS name FROM category ORDER BY name`
    );

    // 카테고리별 인기 도서 (선택된 카테고리만, 없으면 전체 카테고리)
    const params = [];
    let whereCat = "";
    if (selectedCategoryId) {
      params.push(selectedCategoryId);
      whereCat = `WHERE c.category_id = $${params.length}`;
    }
    const { rows: byCatRows } = await db.query(
      `SELECT 
          c.category_id,
          c.category_name,
          b.book_id,
          b.title,
          b.author,
          COUNT(DISTINCT l.loan_id) AS borrow_count,
          COALESCE(string_agg(DISTINCT c2.category_name, ', '), '') AS categories
        FROM category c
        JOIN book_category bc ON bc.category_id = c.category_id
        JOIN book b ON b.book_id = bc.book_id
        LEFT JOIN loan l ON l.book_id = b.book_id 
          AND l.borrow_date >= (CURRENT_DATE - INTERVAL '3 months')
        LEFT JOIN book_category bc2 ON bc2.book_id = b.book_id
        LEFT JOIN category c2 ON c2.category_id = bc2.category_id
        ${whereCat}
        GROUP BY c.category_id, c.category_name, b.book_id
        ORDER BY c.category_name ASC, borrow_count DESC, b.title ASC
      `,
      params
    );

    const popularBooksByCategory = {};
    for (const row of byCatRows) {
      const key = row.category_name;
      if (!popularBooksByCategory[key]) popularBooksByCategory[key] = [];
      popularBooksByCategory[key].push({
        title: row.title,
        author: row.author,
        categories: row.categories,
        borrow_count: Number(row.borrow_count) || 0,
      });
    }

    // 다독왕: 최근 3개월 기준 상위 유저 (대출 건수)
    const { rows: topBorrowers } = await db.query(
      `SELECT 
          u.username,
          COUNT(*) AS borrow_count
        FROM loan l
        JOIN users u ON u.user_id = l.user_id
        WHERE l.borrow_date >= (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY u.user_id, u.username
        ORDER BY borrow_count DESC, u.username ASC
        LIMIT 10`
    );

    // 일 별 평균 대출량: 최근 3개월, 요일별 평균 (월~일)
    const { rows: avgLoansByDow } = await db.query(
      `WITH days AS (
          SELECT generate_series(
                    (CURRENT_DATE - INTERVAL '3 months')::date,
                    CURRENT_DATE::date,
                    INTERVAL '1 day'
                 )::date AS d
        ),
        per_day AS (
          SELECT borrow_date::date AS d, COUNT(*) AS cnt
          FROM loan
          WHERE borrow_date >= (CURRENT_DATE - INTERVAL '3 months')
          GROUP BY borrow_date::date
        )
        SELECT 
          EXTRACT(DOW FROM days.d) AS dow,
          to_char(days.d, 'Dy') AS dow_label,
          ROUND(AVG(COALESCE(per_day.cnt, 0))::numeric, 1) AS avg_loans
        FROM days
        LEFT JOIN per_day ON per_day.d = days.d
        GROUP BY 1,2
        ORDER BY 1`
    );

    res.render("pages/charts", {
      title: "Charts",
      popularBooks,
      popularBooksByCategory,
      categories,
      selectedCategoryId,
      topBorrowers,
      avgLoansByDow,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getChartsPage,
};
