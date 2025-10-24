const db = require("../config/db");
const adminCode = "2021070173"; // admin code(본인 학번)를 추가하세요.

const getLoginPage = (req, res) => {
  res.render("pages/login", { title: "Login" });
};

const getRegisterPage = (req, res) => {
  res.render("pages/register", { title: "Register" });
};

const logoutAndGetHomePage = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
};

const postLogin = async (req, res, next) => {
  const { username, password } = req.body;
  try {
    /*
             username과 password를 이용해 로그인을 진행하는 코드를 작성하세요.
        */
    const { rows } = await db.query(
      "SELECT user_id AS id, username, role FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );
    const user = rows[0];
    if (user) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      res.redirect("/");
    } else {
      const err = new Error("Invalid username or password.");
      return next(err);
    }
  } catch (err) {
    return next(err);
  }
};

const postRegister = async (req, res, next) => {
  const { username, password, role, admin_code: req_admin_code } = req.body;
  const client = await db.pool.connect();

  try {
    /*
            username, password, role, admin_code를 이용해 새로운 계정을 추가하는 코드를 작성하세요.
        */
    await client.query("BEGIN");
    const { rows: existingUsers } = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (existingUsers.length > 0) {
      const err = new Error("Username already exists.");
      await client.query("COMMIT");
      return next(err);
    }
    if (role === "admin" && req_admin_code !== adminCode) {
      const err = new Error("Invalid admin code.");
      await client.query("COMMIT");
      return next(err);
    }
    await client.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
      [username, password, role]
    );
    await client.query("COMMIT");
    res.redirect("/login");
  } catch (err) {
    await client.query("ROLLBACK");
    return next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getLoginPage,
  getRegisterPage,
  logoutAndGetHomePage,
  postLogin,
  postRegister,
};
