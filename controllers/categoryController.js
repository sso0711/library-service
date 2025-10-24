const db = require("../config/db");

const getCategoriesPage = async (req, res, next) => {
  // const dummyCategories = [ // 구현을 다하면 제거해주세요.
  //     { id: 1, name: 'Fantasy' },
  //     { id: 2, name: 'Science Fiction' },
  //     { id: 3, name: 'Mystery' },
  // ];
  try {
    /*
            TODO: 모든 카테고리를 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    const { rows: categories } = await db.query(
      "SELECT category_id AS id, category_name AS name FROM category ORDER BY category_name"
    );
    res.render("pages/categories", {
      title: "Category Management",
      categories,
    });
  } catch (err) {
    next(err);
  }
};

const postDeleteCategory = async (req, res, next) => {
  const categoryId = Number(req.params.id);
  try {
    /*
            TODO: 카테고리를 제거하는 코드를 작성하세요.
            만약 해당 카테고리에 포함된 책이 있다면 책에서 해당 카테고리만 지우고 나머지 카테고리는 유지하면 됩니다.
        */
    // book_category.category_id는 category(category_id)를 참조하며 ON DELETE CASCADE 이므로,
    // 카테고리 삭제 시 매핑만 제거되고 책은 유지됩니다.
    await db.query("DELETE FROM category WHERE category_id = $1", [categoryId]);
    res.redirect("/categories");
  } catch (err) {
    next(err);
  }
};

const postAddCategory = async (req, res, next) => {
  try {
    let { name } = req.body;
    name = (name || "").trim();
    if (!name) {
      const err = new Error("Category name is required.");
      err.status = 400;
      return next(err);
    }

    await db.query(
      `INSERT INTO category (category_name) VALUES ($1)
       ON CONFLICT (category_name) DO NOTHING`,
      [name]
    );

    return res.redirect("/categories");
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategoriesPage,
  postDeleteCategory,
  postAddCategory,
};
