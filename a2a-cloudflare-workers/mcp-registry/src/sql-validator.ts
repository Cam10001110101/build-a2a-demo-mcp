// SQL Query Validator and Builder for Travel Database
// This module provides secure SQL query construction to prevent SQL injection

export interface QueryConstraints {
  tables: string[];
  columns: Record<string, string[]>;
  maxLimit: number;
}

// Define allowed tables and columns for the travel database
export const TRAVEL_DB_CONSTRAINTS: QueryConstraints = {
  tables: ['flights', 'hotels', 'car_rentals', 'places'],
  columns: {
    flights: [
      'id', 'flight_number', 'airline', 'origin', 'destination',
      'departure_time', 'arrival_time', 'price', 'duration',
      'stops', 'aircraft_type', 'available_seats'
    ],
    hotels: [
      'id', 'name', 'location', 'address', 'rating',
      'price_per_night', 'amenities', 'room_types',
      'check_in_time', 'check_out_time', 'description'
    ],
    car_rentals: [
      'id', 'company', 'car_type', 'model', 'location',
      'price_per_day', 'available', 'features', 'fuel_type'
    ],
    places: [
      'id', 'name', 'type', 'location', 'description',
      'rating', 'opening_hours', 'admission_fee'
    ]
  },
  maxLimit: 100
};

export interface SafeQuery {
  sql: string;
  bindings: any[];
}

export class SQLQueryBuilder {
  private constraints: QueryConstraints;

  constructor(constraints: QueryConstraints) {
    this.constraints = constraints;
  }

  // Parse and validate a SELECT query
  parseSelectQuery(query: string): SafeQuery {
    const normalized = query.trim().replace(/\s+/g, ' ');
    
    // Basic SELECT pattern matching
    const selectMatch = normalized.match(
      /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i
    );

    if (!selectMatch) {
      throw new Error('Invalid SELECT query format. Use: SELECT columns FROM table [WHERE conditions] [ORDER BY column] [LIMIT n]');
    }

    const [, columns, table, where, orderBy, limit] = selectMatch;

    // Validate table
    if (!this.constraints.tables.includes(table.toLowerCase())) {
      throw new Error(`Invalid table: ${table}. Allowed tables: ${this.constraints.tables.join(', ')}`);
    }

    // Validate columns
    const columnList = this.parseColumns(columns, table);
    
    // Parse WHERE clause
    const { whereClause, bindings } = where ? this.parseWhereClause(where, table) : { whereClause: '', bindings: [] };
    
    // Validate ORDER BY
    const orderByClause = orderBy ? this.parseOrderBy(orderBy, table) : '';
    
    // Validate and apply LIMIT
    const limitValue = limit ? Math.min(parseInt(limit, 10), this.constraints.maxLimit) : this.constraints.maxLimit;

    // Construct safe query
    let sql = `SELECT ${columnList} FROM ${table}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (orderByClause) sql += ` ORDER BY ${orderByClause}`;
    sql += ` LIMIT ${limitValue}`;

    return { sql, bindings };
  }

  private parseColumns(columns: string, table: string): string {
    if (columns.trim() === '*') {
      return '*';
    }

    const allowedColumns = this.constraints.columns[table.toLowerCase()];
    const requestedColumns = columns.split(',').map(c => c.trim());
    
    const validColumns = requestedColumns.filter(col => {
      const cleanCol = col.toLowerCase().replace(/[^a-z0-9_]/g, '');
      return allowedColumns.includes(cleanCol);
    });

    if (validColumns.length === 0) {
      throw new Error(`No valid columns specified. Allowed columns for ${table}: ${allowedColumns.join(', ')}`);
    }

    return validColumns.join(', ');
  }

  private parseWhereClause(where: string, table: string): { whereClause: string; bindings: any[] } {
    const allowedColumns = this.constraints.columns[table.toLowerCase()];
    const conditions: string[] = [];
    const bindings: any[] = [];

    // Split by AND/OR (simplified - only supports AND for now)
    const parts = where.split(/\s+AND\s+/i);

    for (const part of parts) {
      // Match column operator value pattern
      const match = part.match(/^(\w+)\s*(=|!=|<>|<|>|<=|>=|LIKE)\s*['"]?(.+?)['"]?$/i);
      
      if (!match) {
        throw new Error(`Invalid WHERE clause format: ${part}`);
      }

      const [, column, operator, value] = match;
      
      if (!allowedColumns.includes(column.toLowerCase())) {
        throw new Error(`Invalid column in WHERE clause: ${column}`);
      }

      conditions.push(`${column} ${operator.toUpperCase()} ?`);
      
      // Handle different value types
      if (value.toLowerCase() === 'null') {
        bindings.push(null);
      } else if (!isNaN(Number(value))) {
        bindings.push(Number(value));
      } else {
        bindings.push(value.replace(/^['"]|['"]$/g, ''));
      }
    }

    return {
      whereClause: conditions.join(' AND '),
      bindings
    };
  }

  private parseOrderBy(orderBy: string, table: string): string {
    const allowedColumns = this.constraints.columns[table.toLowerCase()];
    const parts = orderBy.split(/\s+/);
    
    if (parts.length === 0 || parts.length > 2) {
      throw new Error('Invalid ORDER BY format. Use: column [ASC|DESC]');
    }

    const column = parts[0];
    const direction = parts[1]?.toUpperCase() || 'ASC';

    if (!allowedColumns.includes(column.toLowerCase())) {
      throw new Error(`Invalid column in ORDER BY: ${column}`);
    }

    if (!['ASC', 'DESC'].includes(direction)) {
      throw new Error('ORDER BY direction must be ASC or DESC');
    }

    return `${column} ${direction}`;
  }
}

// Helper function to execute safe queries
export async function executeSafeQuery(
  query: string, 
  db: D1Database,
  constraints: QueryConstraints = TRAVEL_DB_CONSTRAINTS
): Promise<D1Result<any>> {
  const builder = new SQLQueryBuilder(constraints);
  const safeQuery = builder.parseSelectQuery(query);
  
  const stmt = db.prepare(safeQuery.sql);
  if (safeQuery.bindings.length > 0) {
    return stmt.bind(...safeQuery.bindings).all();
  }
  return stmt.all();
}