require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const User = require('../models/User');

async function createSingleStudent(studentNumber, name) {
    if (!/^\d{9}$/.test(studentNumber) || !name) {
        console.error('Invalid student number or name.');
        process.exit(1);
    }
    const email = `${studentNumber}@gordoncollege.edu.ph`;
    const defaultPassword = studentNumber.slice(-5) + 'GC' + studentNumber.slice(0, 4);
    const hashedPassword = await bcrypt.hash(defaultPassword, 15);

    await mongoose.connect(process.env.MONGODB_URI);

    try {
        const user = new User({
            username: name,
            email,
            password: hashedPassword,
            role: null,
            altRole: null
        });
        await user.save();
        console.log('User created:', { name, email, defaultPassword });
    } catch (err) {
        console.error('Insert error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

async function batchCreateStudents(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const users = [];

    for (const line of lines) {
        const [studentNumber, ...nameParts] = line.trim().split(' ');
        const name = nameParts.join(' ');
        if (!/^\d{11}$/.test(studentNumber) || !name) {
            console.error(`Invalid entry: ${line}`);
            continue;
        }
        const email = `${studentNumber}@gordoncollege.edu.ph`;
        const defaultPassword = studentNumber.slice(-5) + 'GC' + studentNumber.slice(0, 4);
        const hashedPassword = await bcrypt.hash(defaultPassword, 15);
        users.push({
            username: name,
            email,
            password: hashedPassword,
            role: null
        });
    }

    await mongoose.connect(process.env.MONGODB_URI);

    try {
        await User.insertMany(users, { ordered: false });
        console.log('Batch insert complete:', users.length, 'users created.');
    } catch (err) {
        console.error('Batch insert error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

if (process.argv.length === 3) {
    // Batch mode
    batchCreateStudents(process.argv[2]);
} else if (process.argv.length >= 4) {
    // Single insert mode
    const studentNumber = process.argv[2];
    const name = process.argv.slice(3).join(' ');
    createSingleStudent(studentNumber, name);
} else {
    console.error('Usage:');
    console.error('  node scripts/createStudent.js <filePath>');
    console.error('  node scripts/createStudent.js <studentNumber> <name>');
    process.exit(1);
}