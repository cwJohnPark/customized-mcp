# PostgreSQL Reader MCP

여러 PostgreSQL 데이터베이스에 읽기 전용으로 접속하는 MCP 서버입니다.
Migration 검증을 위해 다중 DB 연결을 지원합니다.

## 설치

```bash
npm install
npm run build
```

## 사용 가능한 도구 (14개)

### 연결 관리

| 도구 | 설명 |
|------|------|
| `add_connection` | 새 DB 연결 추가 (name, host, port, database, user, password) |
| `remove_connection` | DB 연결 제거 |
| `list_connections` | 활성 연결 목록 조회 |
| `test_connection` | 연결 테스트 (버전, 레이턴시) |

### 스키마 조회

| 도구 | 설명 |
|------|------|
| `list_schemas` | 스키마 목록 조회 |
| `list_tables` | 테이블 목록 조회 |
| `describe_table` | 테이블 구조 조회 |
| `get_indexes` | 인덱스 정보 조회 |
| `get_foreign_keys` | 외래 키 관계 조회 |

### 데이터 조회

| 도구 | 설명 |
|------|------|
| `query` | SELECT 쿼리 실행 (읽기 전용) |
| `get_table_sample` | 샘플 데이터 조회 |
| `get_table_count` | 행 수 조회 |

### Migration 비교 도구

| 도구 | 설명 |
|------|------|
| `compare_schemas` | 두 DB 간 테이블 스키마 비교 |
| `compare_row_counts` | 두 DB 간 테이블 행 수 비교 |

## 사용 예시

```
1. add_connection(name: "source", host: "old-db.example.com", ...)
2. add_connection(name: "target", host: "new-db.example.com", ...)
3. compare_schemas(source_connection: "source", target_connection: "target", table: "users")
4. compare_row_counts(source_connection: "source", target_connection: "target")
```

## Claude Code 설정

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "postgresql-reader": {
      "command": "node",
      "args": ["/Users/cwpark/ees/Dev/mcp/postgresql-reader-mcp/dist/index.js"]
    }
  }
}
```

연결은 `add_connection` 도구로 런타임에 추가합니다.

## 보안

- **읽기 전용**: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER 등 모든 수정 쿼리 차단
- SELECT, WITH, EXPLAIN 문만 허용
- 비밀번호는 메모리에만 저장 (list_connections에서 표시 안함)
