require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const User = require('../models/User');

async function createAdmin(studentNumber, name) {
    const email = `${studentNumber}@gordoncollege.edu.ph`;
    const defaultPassword = studentNumber.slice(-5) + 'GC' + studentNumber.slice(0, 4);
    const hashedPassword = await bcrypt.hash(defaultPassword, 15);

    await mongoose.connect(process.env.MONGODB_URI);

    try {
        const user = new User({
            username: name,
            email,
            password: hashedPassword,
            role: 'admin'
        });
        await user.save();
        console.log('User created:', { name, email, defaultPassword });
    } catch (err) {
        console.error('Insert error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

const studentNumber = process.argv[2];
const name = process.argv.slice(3).join(' ');
createAdmin(studentNumber, name);