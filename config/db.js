const { Pool } = require("pg");
require("dotenv").config();

/*
pool은 postgresql에 물리적 연결을 여러 개 미리 만들어두고 재사용
  (새로운 요청마다 새 소켓을 만들지 않아 성능.자원 사용 )
db.pool.connect()으로 연결된 클라이언트 하나 얻어오고, 작업 끝나면 client.release()로 반환해야함.
*/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 단순 쿼리에는 db.query(...) 사용 가능
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
