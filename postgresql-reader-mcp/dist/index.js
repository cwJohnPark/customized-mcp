#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { Pool } from "pg";
const connections = new Map();
function getConnection(name) {
    const conn = connections.get(name);
    if (!conn) {
        const available = Array.from(connections.keys()).join(", ") || "(none)";
        throw new Error(`Connection '${name}' not found. Available connections: ${available}`);
    }
    return conn.pool;
}
function addConnection(name, host, port, database, user, password) {
    if (connections.has(name)) {
        throw new Error(`Connection '${name}' already exists. Remove it first or use a different name.`);
    }
    const config = {
        host,
        port,
        database,
        user,
        password,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };
    const pool = new Pool(config);
    connections.set(name, {
        pool,
        config: { host, port, database, user },
    });
}
async function removeConnection(name) {
    const conn = connections.get(name);
    if (!conn) {
        throw new Error(`Connection '${name}' not found.`);
    }
    await conn.pool.end();
    connections.delete(name);
}
// Tool definitions
const tools = [
    {
        name: "add_connection",
        description: "Add a new PostgreSQL database connection",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Unique name for this connection (e.g., 'source', 'target', 'prod', 'dev')",
                },
                host: {
                    type: "string",
                    description: "Database host",
                },
                port: {
                    type: "number",
                    description: "Database port (default: 5432)",
                    default: 5432,
                },
                database: {
                    type: "string",
                    description: "Database name",
                },
                user: {
                    type: "string",
                    description: "Database user",
                },
                password: {
                    type: "string",
                    description: "Database password",
                },
            },
            required: ["name", "host", "database", "user", "password"],
        },
    },
    {
        name: "remove_connection",
        description: "Remove a database connection",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Connection name to remove",
                },
            },
            required: ["name"],
        },
    },
    {
        name: "list_connections",
        description: "List all active database connections",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "test_connection",
        description: "Test a database connection",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name to test",
                },
            },
            required: ["connection"],
        },
    },
    {
        name: "list_schemas",
        description: "List all schemas in the database",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
            },
            required: ["connection"],
        },
    },
    {
        name: "list_tables",
        description: "List all tables in a schema",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["connection"],
        },
    },
    {
        name: "describe_table",
        description: "Get the structure/schema of a table including columns, types, and constraints",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                table: {
                    type: "string",
                    description: "Table name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["connection", "table"],
        },
    },
    {
        name: "query",
        description: "Execute a read-only SQL query (SELECT only). Other statements will be rejected.",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                sql: {
                    type: "string",
                    description: "SQL SELECT query to execute",
                },
                params: {
                    type: "array",
                    items: { type: "string" },
                    description: "Query parameters for parameterized queries",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of rows to return (default: 100, max: 1000)",
                    default: 100,
                },
            },
            required: ["connection", "sql"],
        },
    },
    {
        name: "get_table_sample",
        description: "Get sample rows from a table",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                table: {
                    type: "string",
                    description: "Table name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
                limit: {
                    type: "number",
                    description: "Number of sample rows (default: 10, max: 100)",
                    default: 10,
                },
            },
            required: ["connection", "table"],
        },
    },
    {
        name: "get_table_count",
        description: "Get the row count of a table",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                table: {
                    type: "string",
                    description: "Table name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["connection", "table"],
        },
    },
    {
        name: "get_indexes",
        description: "Get indexes for a table",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                table: {
                    type: "string",
                    description: "Table name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["connection", "table"],
        },
    },
    {
        name: "get_foreign_keys",
        description: "Get foreign key relationships for a table",
        inputSchema: {
            type: "object",
            properties: {
                connection: {
                    type: "string",
                    description: "Connection name",
                },
                table: {
                    type: "string",
                    description: "Table name",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["connection", "table"],
        },
    },
    {
        name: "compare_schemas",
        description: "Compare table schemas between two connections (useful for migration validation)",
        inputSchema: {
            type: "object",
            properties: {
                source_connection: {
                    type: "string",
                    description: "Source connection name",
                },
                target_connection: {
                    type: "string",
                    description: "Target connection name",
                },
                table: {
                    type: "string",
                    description: "Table name to compare",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["source_connection", "target_connection", "table"],
        },
    },
    {
        name: "compare_row_counts",
        description: "Compare row counts between two connections for specified tables",
        inputSchema: {
            type: "object",
            properties: {
                source_connection: {
                    type: "string",
                    description: "Source connection name",
                },
                target_connection: {
                    type: "string",
                    description: "Target connection name",
                },
                tables: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of table names to compare (if empty, compares all tables in schema)",
                },
                schema: {
                    type: "string",
                    description: "Schema name (default: public)",
                    default: "public",
                },
            },
            required: ["source_connection", "target_connection"],
        },
    },
];
// Validate that a query is read-only
function isReadOnlyQuery(sql) {
    const normalizedSql = sql.trim().toLowerCase();
    const forbiddenKeywords = [
        "insert",
        "update",
        "delete",
        "drop",
        "create",
        "alter",
        "truncate",
        "grant",
        "revoke",
        "copy",
        "execute",
        "call",
    ];
    if (!normalizedSql.startsWith("select") &&
        !normalizedSql.startsWith("with") &&
        !normalizedSql.startsWith("explain")) {
        return false;
    }
    for (const keyword of forbiddenKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, "i");
        if (regex.test(normalizedSql)) {
            return false;
        }
    }
    return true;
}
// Escape identifier to prevent SQL injection
function escapeIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}
// Tool handlers
async function handleAddConnection(name, host, port = 5432, database, user, password) {
    addConnection(name, host, port, database, user, password);
    // Test the connection
    try {
        const pool = getConnection(name);
        await pool.query("SELECT 1");
        return JSON.stringify({
            success: true,
            message: `Connection '${name}' added successfully`,
            connection: { name, host, port, database, user },
        }, null, 2);
    }
    catch (error) {
        // Remove failed connection
        connections.delete(name);
        throw error;
    }
}
async function handleRemoveConnection(name) {
    await removeConnection(name);
    return JSON.stringify({
        success: true,
        message: `Connection '${name}' removed successfully`,
    }, null, 2);
}
function handleListConnections() {
    const list = Array.from(connections.entries()).map(([name, info]) => ({
        name,
        host: info.config.host,
        port: info.config.port,
        database: info.config.database,
        user: info.config.user,
    }));
    return JSON.stringify(list, null, 2);
}
async function handleTestConnection(name) {
    const pool = getConnection(name);
    const start = Date.now();
    const result = await pool.query("SELECT version()");
    const latency = Date.now() - start;
    return JSON.stringify({
        success: true,
        connection: name,
        latency_ms: latency,
        version: result.rows[0].version,
    }, null, 2);
}
async function handleListSchemas(connection) {
    const db = getConnection(connection);
    const result = await db.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name
  `);
    return JSON.stringify(result.rows, null, 2);
}
async function handleListTables(connection, schema = "public") {
    const db = getConnection(connection);
    const result = await db.query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = $1
    ORDER BY table_name
  `, [schema]);
    return JSON.stringify(result.rows, null, 2);
}
async function handleDescribeTable(connection, table, schema = "public") {
    const db = getConnection(connection);
    const result = await db.query(`
    SELECT
      c.column_name,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default,
      (
        SELECT 'PRIMARY KEY'
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = c.table_schema
          AND tc.table_name = c.table_name
          AND kcu.column_name = c.column_name
      ) as constraint_type
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `, [schema, table]);
    return JSON.stringify(result.rows, null, 2);
}
async function handleQuery(connection, sql, params = [], limit = 100) {
    if (!isReadOnlyQuery(sql)) {
        throw new Error("Only read-only queries (SELECT, WITH, EXPLAIN) are allowed. Modification statements are not permitted.");
    }
    const effectiveLimit = Math.min(Math.max(1, limit), 1000);
    const db = getConnection(connection);
    let querySql = sql.trim();
    if (!querySql.toLowerCase().includes("limit")) {
        querySql = `${querySql} LIMIT ${effectiveLimit}`;
    }
    const result = await db.query(querySql, params);
    return JSON.stringify({
        rowCount: result.rowCount,
        rows: result.rows,
    }, null, 2);
}
async function handleGetTableSample(connection, table, schema = "public", limit = 10) {
    const effectiveLimit = Math.min(Math.max(1, limit), 100);
    const db = getConnection(connection);
    const query = `SELECT * FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)} LIMIT $1`;
    const result = await db.query(query, [effectiveLimit]);
    return JSON.stringify(result.rows, null, 2);
}
async function handleGetTableCount(connection, table, schema = "public") {
    const db = getConnection(connection);
    const query = `SELECT COUNT(*) as count FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
    const result = await db.query(query);
    return JSON.stringify({ count: parseInt(result.rows[0].count) }, null, 2);
}
async function handleGetIndexes(connection, table, schema = "public") {
    const db = getConnection(connection);
    const result = await db.query(`
    SELECT
      i.relname as index_name,
      am.amname as index_type,
      pg_get_indexdef(i.oid) as index_definition,
      ix.indisunique as is_unique,
      ix.indisprimary as is_primary
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = $1 AND n.nspname = $2
    ORDER BY i.relname
  `, [table, schema]);
    return JSON.stringify(result.rows, null, 2);
}
async function handleGetForeignKeys(connection, table, schema = "public") {
    const db = getConnection(connection);
    const result = await db.query(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
    ORDER BY tc.constraint_name
  `, [schema, table]);
    return JSON.stringify(result.rows, null, 2);
}
async function handleCompareSchemas(sourceConnection, targetConnection, table, schema = "public") {
    const sourceDb = getConnection(sourceConnection);
    const targetDb = getConnection(targetConnection);
    const columnQuery = `
    SELECT
      c.column_name,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `;
    const [sourceResult, targetResult] = await Promise.all([
        sourceDb.query(columnQuery, [schema, table]),
        targetDb.query(columnQuery, [schema, table]),
    ]);
    const sourceColumns = new Map(sourceResult.rows.map((r) => [r.column_name, r]));
    const targetColumns = new Map(targetResult.rows.map((r) => [r.column_name, r]));
    const differences = [];
    const onlyInSource = [];
    const onlyInTarget = [];
    // Check columns in source
    for (const [colName, sourceCol] of sourceColumns) {
        const targetCol = targetColumns.get(colName);
        if (!targetCol) {
            onlyInSource.push(colName);
        }
        else {
            // Compare column properties
            const diffs = [];
            if (sourceCol.data_type !== targetCol.data_type) {
                diffs.push(`data_type: ${sourceCol.data_type} -> ${targetCol.data_type}`);
            }
            if (sourceCol.is_nullable !== targetCol.is_nullable) {
                diffs.push(`is_nullable: ${sourceCol.is_nullable} -> ${targetCol.is_nullable}`);
            }
            if (sourceCol.character_maximum_length !== targetCol.character_maximum_length) {
                diffs.push(`max_length: ${sourceCol.character_maximum_length} -> ${targetCol.character_maximum_length}`);
            }
            if (diffs.length > 0) {
                differences.push({ column: colName, differences: diffs });
            }
        }
    }
    // Check columns only in target
    for (const colName of targetColumns.keys()) {
        if (!sourceColumns.has(colName)) {
            onlyInTarget.push(colName);
        }
    }
    const isIdentical = differences.length === 0 && onlyInSource.length === 0 && onlyInTarget.length === 0;
    return JSON.stringify({
        table,
        schema,
        source_connection: sourceConnection,
        target_connection: targetConnection,
        is_identical: isIdentical,
        source_column_count: sourceColumns.size,
        target_column_count: targetColumns.size,
        only_in_source: onlyInSource,
        only_in_target: onlyInTarget,
        differences,
    }, null, 2);
}
async function handleCompareRowCounts(sourceConnection, targetConnection, tables = [], schema = "public") {
    const sourceDb = getConnection(sourceConnection);
    const targetDb = getConnection(targetConnection);
    // If no tables specified, get all tables from source
    let tableList = tables;
    if (tableList.length === 0) {
        const tablesResult = await sourceDb.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`, [schema]);
        tableList = tablesResult.rows.map((r) => r.table_name);
    }
    const comparisons = [];
    for (const table of tableList) {
        try {
            const countQuery = `SELECT COUNT(*) as count FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
            const [sourceCount, targetCount] = await Promise.all([
                sourceDb.query(countQuery).then(r => parseInt(r.rows[0].count)),
                targetDb.query(countQuery).then(r => parseInt(r.rows[0].count)).catch(() => null),
            ]);
            comparisons.push({
                table,
                source_count: sourceCount,
                target_count: targetCount,
                difference: targetCount !== null ? targetCount - sourceCount : null,
                match: sourceCount === targetCount,
            });
        }
        catch (error) {
            comparisons.push({
                table,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const totalMatch = comparisons.filter(c => c.match === true).length;
    const totalMismatch = comparisons.filter(c => c.match === false).length;
    const totalErrors = comparisons.filter(c => c.error).length;
    return JSON.stringify({
        source_connection: sourceConnection,
        target_connection: targetConnection,
        schema,
        summary: {
            total_tables: comparisons.length,
            matching: totalMatch,
            mismatching: totalMismatch,
            errors: totalErrors,
        },
        comparisons,
    }, null, 2);
}
// Create and run the server
async function main() {
    const server = new Server({
        name: "postgresql-reader-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools };
    });
    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            let result;
            switch (name) {
                case "add_connection":
                    result = await handleAddConnection(args?.name, args?.host, args?.port || 5432, args?.database, args?.user, args?.password);
                    break;
                case "remove_connection":
                    result = await handleRemoveConnection(args?.name);
                    break;
                case "list_connections":
                    result = handleListConnections();
                    break;
                case "test_connection":
                    result = await handleTestConnection(args?.connection);
                    break;
                case "list_schemas":
                    result = await handleListSchemas(args?.connection);
                    break;
                case "list_tables":
                    result = await handleListTables(args?.connection, args?.schema);
                    break;
                case "describe_table":
                    result = await handleDescribeTable(args?.connection, args?.table, args?.schema);
                    break;
                case "query":
                    result = await handleQuery(args?.connection, args?.sql, args?.params, args?.limit);
                    break;
                case "get_table_sample":
                    result = await handleGetTableSample(args?.connection, args?.table, args?.schema, args?.limit);
                    break;
                case "get_table_count":
                    result = await handleGetTableCount(args?.connection, args?.table, args?.schema);
                    break;
                case "get_indexes":
                    result = await handleGetIndexes(args?.connection, args?.table, args?.schema);
                    break;
                case "get_foreign_keys":
                    result = await handleGetForeignKeys(args?.connection, args?.table, args?.schema);
                    break;
                case "compare_schemas":
                    result = await handleCompareSchemas(args?.source_connection, args?.target_connection, args?.table, args?.schema);
                    break;
                case "compare_row_counts":
                    result = await handleCompareRowCounts(args?.source_connection, args?.target_connection, args?.tables, args?.schema);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            return {
                content: [{ type: "text", text: result }],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error: ${errorMessage}` }],
                isError: true,
            };
        }
    });
    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Handle shutdown
    process.on("SIGINT", async () => {
        for (const [, conn] of connections) {
            await conn.pool.end();
        }
        process.exit(0);
    });
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map