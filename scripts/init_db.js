const db = require("../config/db");

const initDB = async () => {
  try {
    console.log("Deleting existing tables...");
    await db.query("DROP TABLE IF EXISTS loan CASCADE");
    await db.query("DROP TABLE IF EXISTS book_copy CASCADE");
    await db.query("DROP TABLE IF EXISTS book_category CASCADE");
    await db.query("DROP TABLE IF EXISTS book CASCADE");
    await db.query("DROP TABLE IF EXISTS category CASCADE");
    await db.query("DROP TABLE IF EXISTS users CASCADE");

    console.log("Creating new tables...");

    await db.query(`
            CREATE TABLE category (
                category_id SERIAL PRIMARY KEY,
                category_name VARCHAR(100) NOT NULL UNIQUE
            )
        `);

    // 책 정보 테이블
    // 책이 추가되면 total_count와 remain_count가 1씩 증가
    await db.query(`
            CREATE TABLE book (
                book_id SERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                author VARCHAR(100) NOT NULL,
                total_count INTEGER NOT NULL DEFAULT 1,
                remain_count INTEGER NOT NULL DEFAULT 1,
                UNIQUE(title, author)
            )
        `);

    // 책과 카테고리의 다대다 관계를 나타내기 위한 테이블
    await db.query(`
            CREATE TABLE book_category (
                book_id INTEGER,
                category_id INTEGER,
                PRIMARY KEY (book_id, category_id),
                FOREIGN KEY (book_id) REFERENCES book(book_id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES category(category_id) ON DELETE CASCADE
            )
        `);

    // 같은 책 여러 권을 구분하기 위한 용도. (같은 책 내에서 copy_number 1,2,3 으로 구분.)
    // status는 책의 대여 가능 여부를 나타내며, 1은 대여 가능, 0은 대여 불가능(대여 중)을 의미
    await db.query(`
            CREATE TABLE book_copy (
                book_id INTEGER,
                copy_number INTEGER,
                status BOOLEAN DEFAULT TRUE,
                PRIMARY KEY (book_id, copy_number),
                FOREIGN KEY (book_id) REFERENCES book(book_id) ON DELETE CASCADE
            )
        `);

    await db.query(`
            CREATE TABLE users (
                user_id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'admin'))
            )
        `);

    // due_date는 대출이 발생할 때 borrow_date로부터 7일 후로 설정
    // 반납하면 return_date가 설정된다.
    // is_overdue는 return_date가 due_date를 지났을 때 TRUE로 업데이트
    await db.query(`
            CREATE TABLE loan (
                loan_id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                copy_number INTEGER NOT NULL,
                borrow_date DATE NOT NULL DEFAULT CURRENT_DATE,
                due_date DATE NOT NULL,
                return_date DATE,
                is_overdue BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (book_id, copy_number) REFERENCES book_copy(book_id, copy_number)
            )
        `);

    console.log("Database initialization completed successfully.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    await db.pool.end();
  }
};

initDB();
