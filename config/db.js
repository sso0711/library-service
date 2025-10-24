const { Pool } = require("pg");
require("dotenv").config();

/*
pool은 postgresql에 물리적 연결을 여러 개 미리 만들어두고 재사용
  (새로운 요청마다 새 소켓을 만들지 않아 성능.자원 사용 )
db.pool.connect()으로 연결된 클라이언트 하나 얻어오고, 작업 끝나면 client.release()로 반환해야함.
*/

const connectionString = (process.env.DATABASE_URL || "").trim();

// 대부분의 매니지드 Postgres는 클라우드 환경에서 SSL을 요구합니다.
// 다음 조건 중 하나라도 만족하면 SSL을 활성화합니다.
// - PGSSLMODE=require
// - DATABASE_URL에 sslmode=require 포함
// - NODE_ENV=production (배포 환경)
const shouldEnableSSL = (() => {
  if (!connectionString) return false;
  if ((process.env.PGSSLMODE || "").toLowerCase() === "require") return true;
  if (connectionString.toLowerCase().includes("sslmode=require")) return true;
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
})();

if (
  !connectionString &&
  (process.env.NODE_ENV || "").toLowerCase() === "production"
) {
  console.error(
    "DATABASE_URL is not set in production. Configure a remote Postgres connection string in your cloud environment variables."
  );
}

const pool = new Pool({
  connectionString,
  ssl: shouldEnableSSL ? { rejectUnauthorized: false } : undefined,
});

// 단순 쿼리에는 db.query(...) 사용 가능
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
