const db = require("../config/db");

const getUsersPage = async (req, res, next) => {
  const { searchBy, query } = req.query;

  try {
    /*
            TODO: 검색어에 맞춰 유저 목록을 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    let sql = "SELECT user_id AS id, username, role FROM users";
    const params = [];
    if (query) {
      if (searchBy === "role") {
        params.push(`%${query}%`);
        sql += ` WHERE role ILIKE $${params.length}`;
      } else {
        // default: username
        params.push(`%${query}%`);
        sql += ` WHERE username ILIKE $${params.length}`;
      }
    }
    sql += " ORDER BY user_id";
    const { rows: users } = await db.query(sql, params);

    res.render("pages/users", {
      title: "User Management",
      users,
      searchBy,
      query,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getUsersPage,
};
