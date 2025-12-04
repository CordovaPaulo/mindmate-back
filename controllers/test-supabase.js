const supabase = require('../config/supabase');

/**
 * Test Supabase connection and fetch data
 */
exports.testSupabaseConnection = async (req, res) => {
    try {
        // Test 1: Check connection
        const connectionTest = {
            status: 'connected',
            url: process.env.SUPABASE_URL || 'Not configured'
        };

        // Test 2: Fetch all students
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('*')
            .limit(10);

        if (studentsError) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching students',
                error: studentsError.message,
                connection: connectionTest
            });
        }

        // Test 3: Count total students
        const { count, error: countError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true });

        res.json({
            success: true,
            message: 'Supabase connection successful',
            connection: connectionTest,
            data: {
                students: students || [],
                totalStudents: count || 0,
                sampleRecord: students && students.length > 0 ? students[0] : null
            }
        });

    } catch (error) {
        console.error('Supabase test error:', error);
        res.status(500).json({
            success: false,
            message: 'Supabase test failed',
            error: error.message
        });
    }
};

/**
 * Fetch student by ID
 */
exports.getStudentById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: student, error } = await supabase
            .from('students')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({
                success: false,
                message: 'Student not found',
                error: error.message
            });
        }

        res.json({
            success: true,
            data: student
        });

    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching student',
            error: error.message
        });
    }
};

/**
 * Fetch students by program (BSIT, BSCS, GCED)
 */
exports.getStudentsByProgram = async (req, res) => {
    try {
        const { program } = req.params;

        const { data: students, error } = await supabase
            .from('students')
            .select('*')
            .eq('program', program)
            .order('name', { ascending: true });

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching students',
                error: error.message
            });
        }

        res.json({
            success: true,
            program: program,
            count: students ? students.length : 0,
            data: students || []
        });

    } catch (error) {
        console.error('Error fetching students by program:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching students',
            error: error.message
        });
    }
};

/**
 * Search students by name or email
 */
exports.searchStudents = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const { data: students, error } = await supabase
            .from('students')
            .select('*')
            .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(20);

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error searching students',
                error: error.message
            });
        }

        res.json({
            success: true,
            query: query,
            count: students ? students.length : 0,
            data: students || []
        });

    } catch (error) {
        console.error('Error searching students:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching students',
            error: error.message
        });
    }
};

/**
 * Get active students only
 */
exports.getActiveStudents = async (req, res) => {
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('*')
            .eq('isActive', true)
            .order('name', { ascending: true });

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching active students',
                error: error.message
            });
        }

        res.json({
            success: true,
            count: students ? students.length : 0,
            data: students || []
        });

    } catch (error) {
        console.error('Error fetching active students:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active students',
            error: error.message
        });
    }
};
