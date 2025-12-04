const supabase = require('../config/supabase');

/**
 * Supabase Database Service
 * Provides utility functions for interacting with Supabase PostgreSQL database
 */

class SupabaseService {
    /**
     * Execute a raw SQL query
     * @param {string} query - SQL query string
     * @param {Array} params - Query parameters
     */
    async executeQuery(query, params = []) {
        try {
            const { data, error } = await supabase.rpc('execute_sql', {
                query_text: query,
                query_params: params
            });

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Supabase query error:', error);
            return { data: null, error };
        }
    }

    /**
     * Insert data into a table
     * @param {string} table - Table name
     * @param {Object|Array} data - Data to insert
     */
    async insert(table, data) {
        try {
            const { data: result, error } = await supabase
                .from(table)
                .insert(data)
                .select();

            if (error) throw error;
            return { data: result, error: null };
        } catch (error) {
            console.error(`Supabase insert error (${table}):`, error);
            return { data: null, error };
        }
    }

    /**
     * Update data in a table
     * @param {string} table - Table name
     * @param {Object} data - Data to update
     * @param {Object} filter - Filter conditions
     */
    async update(table, data, filter) {
        try {
            let query = supabase.from(table).update(data);

            // Apply filters
            Object.entries(filter).forEach(([key, value]) => {
                query = query.eq(key, value);
            });

            const { data: result, error } = await query.select();

            if (error) throw error;
            return { data: result, error: null };
        } catch (error) {
            console.error(`Supabase update error (${table}):`, error);
            return { data: null, error };
        }
    }

    /**
     * Delete data from a table
     * @param {string} table - Table name
     * @param {Object} filter - Filter conditions
     */
    async delete(table, filter) {
        try {
            let query = supabase.from(table).delete();

            // Apply filters
            Object.entries(filter).forEach(([key, value]) => {
                query = query.eq(key, value);
            });

            const { data, error } = await query;

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error(`Supabase delete error (${table}):`, error);
            return { data: null, error };
        }
    }

    /**
     * Select data from a table
     * @param {string} table - Table name
     * @param {Object} options - Query options (select, filter, order, limit, etc.)
     */
    async select(table, options = {}) {
        try {
            let query = supabase.from(table).select(options.select || '*');

            // Apply filters
            if (options.filter) {
                Object.entries(options.filter).forEach(([key, value]) => {
                    if (typeof value === 'object' && value.operator) {
                        // Support for operators like gt, lt, like, etc.
                        query = query[value.operator](key, value.value);
                    } else {
                        query = query.eq(key, value);
                    }
                });
            }

            // Apply ordering
            if (options.order) {
                const { column, ascending = true } = options.order;
                query = query.order(column, { ascending });
            }

            // Apply limit
            if (options.limit) {
                query = query.limit(options.limit);
            }

            // Apply offset
            if (options.offset) {
                query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
            }

            const { data, error } = await query;

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error(`Supabase select error (${table}):`, error);
            return { data: null, error };
        }
    }

    /**
     * Get a single record
     * @param {string} table - Table name
     * @param {Object} filter - Filter conditions
     */
    async findOne(table, filter) {
        try {
            let query = supabase.from(table).select('*');

            // Apply filters
            Object.entries(filter).forEach(([key, value]) => {
                query = query.eq(key, value);
            });

            const { data, error } = await query.single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error(`Supabase findOne error (${table}):`, error);
            return { data: null, error };
        }
    }

    /**
     * Count records in a table
     * @param {string} table - Table name
     * @param {Object} filter - Filter conditions
     */
    async count(table, filter = {}) {
        try {
            let query = supabase.from(table).select('*', { count: 'exact', head: true });

            // Apply filters
            Object.entries(filter).forEach(([key, value]) => {
                query = query.eq(key, value);
            });

            const { count, error } = await query;

            if (error) throw error;
            return { count, error: null };
        } catch (error) {
            console.error(`Supabase count error (${table}):`, error);
            return { count: null, error };
        }
    }

    /**
     * Upsert (Insert or Update) data
     * @param {string} table - Table name
     * @param {Object|Array} data - Data to upsert
     * @param {Object} options - Upsert options
     */
    async upsert(table, data, options = {}) {
        try {
            const { data: result, error } = await supabase
                .from(table)
                .upsert(data, options)
                .select();

            if (error) throw error;
            return { data: result, error: null };
        } catch (error) {
            console.error(`Supabase upsert error (${table}):`, error);
            return { data: null, error };
        }
    }
}

module.exports = new SupabaseService();
