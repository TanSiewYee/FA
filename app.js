const express = require("express");
const mysql = require("mysql2");
const axios = require("axios");
require("dotenv").config();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const escapeHtml = require("escape-html");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60
    }
}));

app.use(express.static("public"));

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err)
        throw err;
    console.log("Connected to MySQL");
});


// Root Route - Home Page
app.get("/", (req, res) => {
    // Not logged in
    if (!req.session.user) {
        return res.redirect("/index.html");
    }
    // Already logged in as Patient
    if (req.session.user.role === "Patient") {
        return res.redirect("/patient-dashboard");
    }
    // Already logged in as Doctor
    if (req.session.user.role === "Doctor") {
        return res.redirect("/doctor-dashboard");
    }
    // Already logged in as Admin
    if (req.session.user.role === "Admin") {
        return res.redirect("/admin-dashboard");
    }
    res.redirect("/index.html");
});

// BOOK APPOINTMENT
app.post("/appointment",requireRole("Patient"),(req, res) => {
        let patient_id =req.session.user.patient_id;
        let doctor_id =req.body.doctor_id;
        let appointment_date = req.body.appointment_date;
        let appointment_time =req.body.appointment_time;
        let reason =req.body.reason;

    let availabilitySQL = `
        SELECT *
        FROM doctor_availability
        WHERE doctor_id = ?
        AND available_date = ?
        AND start_time <= ?
        AND end_time >= ?
    `;

    db.query(
        availabilitySQL,
        [
            doctor_id,
            appointment_date,
            appointment_time,
            appointment_time
        ],
        (err, availabilityResults) => {
            if (err) {
                console.error(
                    "Availability Check Error:",err
                );
                return res
                    .status(500)
                    .send("Database error.");
            }

            // Doctor not available
            if (availabilityResults.length === 0) {
                return res.send(`
                    <div style="max-width: 500px;margin: 50px auto;font-family: Arial, sans-serif;text-align: center;padding: 30px;border-radius: 12px;box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                        <h2 style="color: #d32f2f;">⚠️ Time Slot Unavailable</h2>
                            
                        <p style="color: #555;font-size: 16px;">
                            The requested doctor is fully booked or off-duty during this time. Please pick another slot.
                        </p>
                        <div style="margin-top: 25px;">
                            <a href="/book-appointment" style="display: inline-block;padding: 10px 20px;background-color: #007bff;color: #fff;text-decoration: none;border-radius: 6px;">
                                Choose Another Slot
                            </a>
                        </div>
                    </div>
                `);
            }

            let bookingSQL = `
                SELECT *
                FROM appointments
                WHERE doctor_id = ?
                AND appointment_date = ?
                AND appointment_time = ?
            `;

            db.query(
                bookingSQL,
                [
                    doctor_id,
                    appointment_date,
                    appointment_time
                ],
                (err, bookingResults) => {
                    if (err) {
                        console.error(
                            "Booking Check Error:",
                            err
                        );
                        return res
                            .status(500)
                            .send("Database error.");
                    }

                    // Time already booked
                    if (bookingResults.length > 0) {
                        return res.send(`
                            <div style="max-width: 500px;margin: 50px auto;font-family: Arial,sans-serif;text-align: center;padding: 30px;border-radius: 12px;box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                                <h2 style="color: #d32f2f;">⚠️ Time Slot Unavailable</h2>
                                <p style="color: #555;font-size: 16px;">
                                    This time slot has already been booked by another patient.
                                </p>

                                <div style="margin-top: 25px;">
                                    <a href="/book-appointment"style="display: inline-block;padding: 10px 20px;background-color: #007bff;color: #fff;text-decoration: none;border-radius: 6px;">
                                        Try Again
                                    </a>
                                </div>
                            </div>
                        `);
                    }

                    db.beginTransaction(
                        (transactionError) => {
                            if (transactionError) {
                                console.error(
                                    "Transaction Start Error:",
                                    transactionError
                                );
                                return res
                                    .status(500)
                                    .send("Unable to start database transaction.");      
                            }

                            console.log(
                                "Database transaction started."
                            );

                            let appointmentSQL = `
                                INSERT INTO appointments
                                (
                                    patient_id,
                                    doctor_id,
                                    appointment_date,
                                    appointment_time,
                                    reason
                                )
                                VALUES (?, ?, ?, ?, ?)
                            `;

                            db.query(
                                appointmentSQL,
                                [
                                    patient_id,
                                    doctor_id,
                                    appointment_date,
                                    appointment_time,
                                    reason
                                ],
                                (err, result) => {

                                    if (err) {
                                        console.error(
                                            "Appointment Insert Error:",err
                                        );

                                        return db.rollback(
                                            () => {
                                                console.log(
                                                    "ROLLBACK: Appointment was not saved."
                                                );

                                                return res
                                                    .status(500)
                                                    .send(`
                                                        <h2>
                                                            Appointment Booking Failed
                                                        </h2>
                                                        <p>
                                                            Database transaction was rolled back.
                                                        </p>
                                                        <a href="/book-appointment">
                                                            Try Again
                                                        </a>
                                                    `);
                                            }
                                        );
                                    }

                                    let appointment_id =
                                        result.insertId;

                                    console.log(
                                        "Appointment inserted:",
                                        appointment_id
                                    );

                                    let reminder_message ="Reminder: You have an appointment on " +appointment_date +" at " +appointment_time +".";
                                    let reminderSQL = `
                                        INSERT INTO appointment_reminders
                                        (
                                            appointment_id,
                                            reminder_message
                                        )
                                        VALUES (?, ?)
                                    `;

                                    db.query(
                                        reminderSQL,
                                        [
                                            appointment_id,
                                            reminder_message
                                        ],
                                        (err, reminderResult) => {
                                            if (err) {
                                                console.error(
                                                    "Reminder Insert Error:",err
                                                );

                                                return db.rollback(
                                                    () => {
                                                        console.log(
                                                            "ROLLBACK: Appointment and reminder were cancelled."
                                                        );

                                                        return res
                                                            .status(500)
                                                            .send(`
                                                                <h2>Appointment Booking Failed</h2>
                                                                <p>The reminder could not be created. The appointment was rolled back.</p>
                                                                <a href="/book-appointment">Try Again</a>

                                                            `);
                                                    });
                                            }

                                            console.log(
                                                "Reminder inserted successfully."
                                            );

                                            db.commit(
                                                (commitError) => {
                                                    if (commitError) {
                                                        console.error(
                                                            "Commit Error:",
                                                            commitError
                                                        );

                                                        return db.rollback(
                                                            () => {
                                                                console.log(
                                                                    "ROLLBACK: Commit failed."
                                                                );

                                                                return res
                                                                    .status(500)
                                                                    .send(
                                                                        "Unable to complete appointment booking."
                                                                    );
                                                            }
                                                        );
                                                    }

                                                    console.log(
                                                        "COMMIT: Appointment and reminder saved successfully."
                                                    );

                                                    
                                                    let informationSQL = `

                                                        SELECT
                                                            patients.name AS patient_name,
                                                            patients.email AS patient_email,
                                                            doctors.name AS doctor_name

                                                        FROM appointments

                                                        JOIN patients
                                                        ON appointments.patient_id =
                                                           patients.patient_id

                                                        JOIN doctors
                                                        ON appointments.doctor_id =
                                                           doctors.doctor_id

                                                        WHERE appointments.appointment_id = ?

                                                    `;

                                                    db.query(
                                                        informationSQL,
                                                        [appointment_id],
                                                        async (
                                                            err,
                                                            informationResults
                                                        ) => {

                                                            if (err) {
                                                                console.error(
                                                                    "Information Query Error:",err
                                                                );

                                                                return res
                                                                    .status(500)
                                                                    .send(
                                                                        "Appointment saved, but appointment information could not be retrieved."
                                                                    );
                                                            }

                                                            if (
                                                                informationResults.length === 0
                                                            ) {
                                                                return res
                                                                    .status(404)
                                                                    .send(
                                                                        "Appointment information not found."
                                                                    );
                                                            }

                                                            let appointment = informationResults[0];
                                                            let emailSent = false;
                                                            try {
                                                                await axios.post(
                                                                    "https://api.brevo.com/v3/smtp/email",
                                                                    {
                                                                        sender: {
                                                                            name:"Healthcare Medical Centre",
                                                                            email:process.env.BREVO_SENDER_EMAIL  
                                                                        },

                                                                        to: [
                                                                            {
                                                                                email:appointment.patient_email,
                                                                                name:appointment.patient_name    
                                                                            }
                                                                        ],

                                                                        subject:"Appointment Confirmation",
                                                                        htmlContent: `
                                                                            <h2>Appointment Confirmed</h2>
                                                                            <p>Dear ${appointment.patient_name},</p>
                                                                            <p>Your healthcare appointment has been successfully booked.</p>
                                                                            <p><strong>Doctor:</strong>${appointment.doctor_name}</p>
                                                                            <p><strong>Date:</strong>${appointment_date}</p>
                                                                            <p><strong>Time:</strong>${appointment_time}</p>
                                                                            <p><strong>Reason:</strong> ${reason || "N/A"}</p>
                                                                            <br>
                                                                            <p>Thank you for using Healthcare Medical Centre.</p>
                                                                        `
                                                                    },
                                                                    {
                                                                        headers: {
                                                                            "api-key":process.env.BREVO_API_KEY,  
                                                                            "Content-Type":"application/json"
                                                                        }
                                                                    }
                                                                );

                                                                console.log(
                                                                    "Brevo email sent successfully."
                                                                );
                                                                emailSent =true;
                                                            } catch (
                                                                emailError
                                                            ) {
                                                                console.error(
                                                                    "Brevo API Error:",
                                                                    emailError
                                                                        .response
                                                                        ?.data ||
                                                                    emailError
                                                                        .message
                                                                );
                                                            }

                                                            res.send(`
                                                                <div style="max-width: 500px;margin: 50px auto;font-family: Arial, sans-serif;text-align: center;padding: 30px;border-radius: 12px;box-shadow:0 4px 15px rgba(0,0,0,0.1)">
                                                                    <h2 style="color: #2e7d32;">🎉 Appointment Confirmed!</h2>
                                                                    <p style="color: #555;font-size: 16px;">We have received your appointment request.</p>
                                                                    ${
                                                                        emailSent
                                                                        ? `
                                                                            <p style="color: #2e7d32;">📧 Confirmation email sent to<strong>${appointment.patient_email}</strong></p>
                                                                        `
                                                                        : `
                                                                            <p style="color: #d32f2f;">
                                                                                ⚠️ Appointment saved, but the confirmation email could not be sent.
                                                                            </p>
                                                                        `
                                                                    }

                                                                    <div style="margin-top: 25px;">
                                                                        <a href="/book-appointment"style="display: inline-block;padding: 10px 20px;background-color: #007bff;color: #fff;text-decoration: none;border-radius: 6px;margin-right: 10px;">
                                                                            Book Another</a>
                                                                        <a href="/my-appointments"style="display: inline-block; padding: 10px 20px;background-color: #6c757d;color: #fff;text-decoration: none;border-radius: 6px;">
                                                                            View Appointments</a>
                                                                    </div>
                                                                </div>
                                                            `);
                                                        });
                                                });
                                        });
                                });
                        });
                });
        });
});

app.get("/book-appointment",requireRole("Patient"),(req, res) => {
        const sql = `
            SELECT
                doctor_id,
                name,
                specialization
            FROM doctors
            ORDER BY name ASC
        `;
        db.query(sql, (err, results) => {
            if (err) {
                console.error(
                    "Doctor Query Error:",
                    err
                );
                return res.status(500).send(
                    "Unable to load doctors."
                );
            }
            let doctorOptions = `
                <option value="">
                    -- Select Doctor --
                </option>
            `;
            results.forEach(doctor => {
                doctorOptions += `
                    <option value="${doctor.doctor_id}">
                        ${doctor.name} - ${doctor.specialization}
                    </option>
                `;
            });

            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport"content="width=device-width, initial-scale=1.0">
                    <title>Book Appointment</title>

                    <link rel="stylesheet" href="/style.css">
                    <script src="/script.js"></script>
                </head>
                <body>
                    <div class="container">
                        <h2>Book Appointment</h2>
                        <form
                            method="POST"
                            action="/appointment"
                            onsubmit="return checkAppointment()"
                        >
                            <label>
                                Doctor:
                            </label>
                            <select
                                name="doctor_id"
                                required
                            >
                                ${doctorOptions}
                            </select>
                            <br><br>
                            <label>
                                Appointment Date:
                            </label>
                            <input
                                type="date"
                                id="appointment_date"
                                name="appointment_date"
                                required
                            >
                            <br><br>
                            <label>
                                Appointment Time:
                            </label>
                            <input
                                type="time"
                                id="appointment_time"
                                name="appointment_time"
                                required
                            >
                            <br><br>
                            <label>
                                Reason:
                            </label>
                            <input
                                type="text"
                                name="reason"
                                required
                            >
                            <br><br>
                            <button type="submit">
                                Book Appointment
                            </button>
                        </form>
                        <br>
                        <a href="/my-appointments">
                            View My Appointments
                        </a>
                        <br><br>
                        <a href="/patient-dashboard">
                            Back to Dashboard
                        </a>
                    </div>
                </body>
                </html>
            `);
        });
    }
);

app.post("/register", async (req, res) => {
    let {
        username,
        email,
        password,
        confirm_password
    } = req.body;

    username = username?.trim();
    email = email?.trim().toLowerCase();

    function showRegisterError(message) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Registration Failed</title>
                <style>
                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                    .error-icon {font-size: 50px;}
                    h2 {color: #d9534f;}
                    p {color: #555; line-height: 1.6;}
                    a {display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                    a:hover {background-color: #0056b3;}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">⚠️</div>
                    <h2>Registration Failed</h2>
                    <p>${message}</p>
                    <a href="/index.html">
                        Back to Registration
                    </a>
                </div>
            </body>
            </html>
        `);
    }

    if (
        !username ||
        !email ||
        !password ||
        !confirm_password
    ) {
        return showRegisterError(
            "Please fill in all required fields."
        );
    }

    const usernamePattern = /^[A-Za-z0-9_]{3,50}$/;
    if (!usernamePattern.test(username)) {
        return showRegisterError(
            "Username must contain 3 to 50 characters and only use letters, numbers or underscore."
        );
    }

    const emailPattern =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return showRegisterError(
            "Please enter a valid email address."
        );
    }

    if (password.length < 6) {
        return showRegisterError(
            "Password must contain at least 6 characters."
        );
    }

    if (password !== confirm_password) {
        return showRegisterError(
            "Password and confirm password do not match."
        );
    }

    const checkUserSql = `
        SELECT user_id
        FROM users
        WHERE username = ?
        OR email = ?
    `;

    db.query(
        checkUserSql,
        [username, email],
        (err, users) => {
            if (err) {
                console.error(
                    "User Check Error:",err
                );

                return showRegisterError(
                    "Unable to verify user account."
                );
            }

            if (users.length > 0) {
                return showRegisterError(
                    "Username or email already has an account."
                );
            }

            const patientSql = `
                SELECT patient_id, name
                FROM patients
                WHERE LOWER(email) = ?
            `;

            db.query(
                patientSql,
                [email],
                (err, patients) => {
                    if (err) {
                        console.error(
                            "Patient Check Error:", err
                        );
                        return showRegisterError(
                            "Unable to verify patient information."
                        );
                    }

                    if (patients.length > 0) {
                        const patient =patients[0];

                        return createAccount(
                            "Patient",
                            patient.patient_id,
                            null,
                            patient.name
                        );
                    }

                    const doctorSql = `
                        SELECT doctor_id, name
                        FROM doctors
                        WHERE LOWER(email) = ?
                    `;

                    db.query(
                        doctorSql,
                        [email],
                        (err, doctors) => {
                            if (err) {
                                console.error(
                                    "Doctor Check Error:",err
                                );

                                return showRegisterError(
                                    "Unable to verify doctor information."
                                );
                            }

                            if (doctors.length > 0) {
                                const doctor =doctors[0];
                                return createAccount(
                                    "Doctor",
                                    null,
                                    doctor.doctor_id,
                                    doctor.name
                                );
                            }
                            return showRegisterError(
                                "This email is not registered as a patient or doctor."
                            );
                        }
                    );
                }
            );
        }
    );

    async function createAccount(
        role,
        patient_id,
        doctor_id,
        name
    ) {
        try {
            const saltRounds = 12;
            const hashedPassword =
                await bcrypt.hash(
                    password,
                    saltRounds
                );

            const sql = `
                INSERT INTO users
                (
                    username,
                    email,
                    password,
                    role,
                    patient_id,
                    doctor_id
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(
                sql,
                [
                    username,
                    email,
                    hashedPassword,
                    role,
                    patient_id,
                    doctor_id
                ],

                (err, result) => {
                    if (err) {
                        console.error(
                            "User Registration Error:",err
                        );

                        if (err.code === "ER_DUP_ENTRY") {
                            return showRegisterError(
                                "Username or email already exists."
                            );
                        }

                        return showRegisterError(
                            "Unable to create user account."
                        );
                    }

                    res.send(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Registration Successful</title>
                            <style>
                                body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                                .success-icon {font-size: 50px;}
                                h2 {color: #28a745;}
                                p {color: #555; line-height: 1.6;}
                                .info {background-color: #f1f3f5; padding: 15px; margin: 20px 0; border-radius: 6px;}
                                a {display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                                a:hover {background-color: #0056b3;}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="success-icon">
                                    ✅
                                </div>
                                <h2>
                                    Registration Successful
                                </h2>
                                <p>
                                    Your account has been created successfully.
                                </p>
                                <div class="info">
                                    <strong>Name:</strong>${name}
                                    <br><br>
                                    <strong>Username:</strong>${username}
                                    <br><br>
                                    <strong>Role:</strong>${role}</div>
                                <a href="/index.html">
                                    Go to Login
                                </a>
                            </div>
                        </body>
                        </html>
                    `);
                }
            );

        } catch (error) {
            console.error(
                "Password Hashing Error:",
                error
            );
            return showRegisterError(
                "Unable to securely process the password."
            );
        }
    }
});

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect(
            "/index.html"
        );
    }
    next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect(
                "/index.html"
            );
        }

        if (req.session.user.role !== role) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Access Denied</title>
                    <style>
                        body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                        .container {width: 90%; max-width: 450px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                        h2 {color: #d9534f;}
                        p {color: #555;}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>Access Denied</h2>
                        <p>
                            You do not have permission
                            to access this page.
                        </p>
                    </div>
                </body>
                </html>
            `);
        }
        next();
    };
}

app.post("/index", (req, res) => {
    let {
        login,
        password
    } = req.body;

    login = login?.trim();
    // CHECK INPUT
    if (!login || !password) {
        return showLoginError(
            "Please enter your username/email and password."
        );
    }
    // FIND USER
    const sql = `
        SELECT *
        FROM users
        WHERE username = ?
        OR email = ?
        LIMIT 1
    `;

    db.query(
        sql,
        [login, login],
        async (err, results) => {
            if (err) {
                console.error(
                    "Login Database Error:",err
                );
                return showLoginError(
                    "Unable to process login."
                );
            }
            // USER NOT FOUND
            if (results.length === 0) {
                return showLoginError(
                    "Invalid username/email or password."
                );
            }
            const user = results[0];

            try {
                // BCRYPT PASSWORD CHECK
                const passwordMatch =
                    await bcrypt.compare(
                        password,
                        user.password
                    );

                if (!passwordMatch) {
                    return showLoginError(
                        "Invalid username/email or password."
                    );
                }

                // CREATE SESSION
                req.session.user = {
                    user_id:user.user_id,
                    username:user.username,
                    email:user.email,
                    role:user.role,
                    patient_id:user.patient_id,
                    doctor_id:user.doctor_id
                };

                // REDIRECT BASED ON ROLE
                if (user.role === "Patient") {
                    return res.redirect(
                        "/patient-dashboard"
                    );
                }

                if (user.role === "Doctor") {
                    return res.redirect(
                        "/doctor-dashboard"
                    );
                }

                if (user.role === "Admin") {
                    return res.redirect(
                        "/admin-dashboard"
                    );
                }

                return showLoginError(
                    "Invalid account role."
                );

            } catch (error) {
                console.error(
                    "Password Comparison Error:",
                    error
                );

                return showLoginError(
                    "Unable to process login."
                );
            }});
//login error page
    function showLoginError(message) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >
                <title>Login Failed</title>
                <style>
                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                    .container {width: 90%; max-width: 450px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                    .error-icon {font-size: 50px;}
                    h2 {color: #d9534f;}
                    p {color: #555; line-height: 1.6;}
                    a {display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                    a:hover {background-color: #0056b3;}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">
                        ⚠️
                    </div>
                    <h2>Login Failed</h2>
                    <p>${message}</p>
                    <a href="/index.html">
                        Back to Login
                    </a>
                </div>
            </body>
            </html>
        `);
    }
});

app.get("/patient-dashboard", requireRole("Patient"), (req, res) => {
    const user = req.session.user;
    const patientId = user.patient_id;
    const statsSql = `
        SELECT
            (SELECT COUNT(*) FROM doctors) AS total_doctors,

            (SELECT COUNT(*)
             FROM appointments
             WHERE patient_id = ?) AS total_appointments,

            (SELECT COUNT(*)
             FROM appointments
             WHERE patient_id = ?
             AND appointment_date >= CURDATE()
             AND status != 'Cancelled') AS upcoming_appointments,

            (SELECT COUNT(*)
             FROM prescriptions p
             JOIN appointments a
                 ON p.appointment_id = a.appointment_id
             WHERE a.patient_id = ?) AS total_prescriptions
    `;

    const appointmentSql = `
        SELECT
            a.appointment_id,
            d.name AS doctor_name,
            d.specialization,
            a.appointment_date,
            a.appointment_time,
            a.status
        FROM appointments a
        JOIN doctors d
            ON a.doctor_id = d.doctor_id
        WHERE a.patient_id = ?
        AND a.appointment_date >= CURDATE()
        AND a.status != 'Cancelled'
        ORDER BY a.appointment_date ASC, a.appointment_time ASC
        LIMIT 5
    `;

    db.query(
        statsSql,
        [patientId, patientId, patientId],
        (err, statsResults) => {

            if (err) {
                console.error("Patient dashboard statistics error:", err);
                return res.status(500).send("Unable to load dashboard.");
            }

            db.query(
                appointmentSql,
                [patientId],
                (err, appointmentResults) => {
                    if (err) {
                        console.error("Patient dashboard appointment error:", err);
                        return res.status(500).send("Unable to load dashboard.");
                    }
                    const stats = statsResults[0];
                    let appointmentRows = appointmentResults.map(appointment => {
                        let statusClass = "status-pending";
                        if (appointment.status === "Confirmed") {
                            statusClass = "status-confirmed";
                        }
                        return `
                            <tr>
                                <td>#${appointment.appointment_id}</td>
                                <td>${escapeHtml(String(appointment.doctor_name || ""))}</td>
                                <td>${escapeHtml(String(appointment.specialization || ""))}</td>
                                <td>${escapeHtml(String(appointment.appointment_date || "").substring(0, 10))}</td>
                                <td>${escapeHtml(String(appointment.appointment_time || ""))}</td>
                                <td>
                                    <span class="${statusClass}">
                                        ${escapeHtml(String(appointment.status || ""))}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join("");

                    if (appointmentRows === "") {
                        appointmentRows = `
                            <tr>
                                <td colspan="6" class="empty-dashboard">
                                    No upcoming appointments.
                                </td>
                            </tr>
                        `;
                    }

                    const today = new Date().toLocaleDateString("en-MY", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    });

                    res.send(`
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Patient Dashboard</title>
                            <link rel="stylesheet" href="/style.css">
                        </head>
                        <body class="dashboard-body">
                            <div class="dashboard-layout">
                                <aside class="dashboard-sidebar">
                                    <div class="sidebar-profile">
                                        <div class="profile-icon">
                                            P
                                        </div>
                                        <div>
                                            <h2>${escapeHtml(String(user.username || "Patient"))}</h2>
                                            <p>${escapeHtml(String(user.email || ""))}</p>
                                        </div>
                                    </div>
                                    <a href="/logout" class="sidebar-logout">
                                        Log out
                                    </a>
                                    <nav class="sidebar-menu">
                                        <a href="/patient-dashboard" class="active">Dashboard</a>
                                        <a href="/book-appointment">Book Appointment</a>
                                        <a href="/my-appointments">My Appointments</a>
                                        <a href="/my-prescriptions">My Prescriptions</a>
                                    </nav>
                                </aside>
                                <main class="dashboard-main">
                                    <div class="dashboard-header">
                                        <div>
                                            <p class="dashboard-label">
                                                Healthcare Appointment System
                                            </p>
                                            <h1>Home</h1>
                                        </div>
                                        <div class="dashboard-date">
                                            <span>Today's Date</span>
                                            <strong>${today}</strong>
                                        </div>
                                    </div>
                                    <section class="welcome-panel">
                                        <div>
                                            <p>Welcome!</p>
                                            <h2>${escapeHtml(String(user.username || "Patient"))}</h2>
                                            <p>Book appointments with available doctors and keep track of your medical appointments.</p>
                                        </div>
                                        <a href="/book-appointment"
                                           class="dashboard-primary-button">
                                            Book Appointment
                                        </a>
                                    </section>
                                    <h2 class="dashboard-section-title">
                                        Status
                                    </h2>
                                    <section class="dashboard-stats">
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_doctors}</strong>
                                                <span>Available Doctors</span>
                                            </div>
                                            <div class="stat-icon">
                                                D
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_appointments}</strong>
                                                <span>My Appointments</span>
                                            </div>
                                            <div class="stat-icon">
                                                A
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.upcoming_appointments}</strong>
                                                <span>Upcoming</span>
                                            </div>
                                            <div class="stat-icon">
                                                U
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_prescriptions}</strong>
                                                <span>Prescriptions</span>
                                            </div>
                                            <div class="stat-icon">
                                                Rx
                                            </div>
                                        </div>
                                    </section>
                                    <section class="dashboard-table-section">
                                        <div class="dashboard-section-header">
                                            <div>
                                                <h2>Your Upcoming Appointments</h2>
                                                <p>Your next scheduled medical appointments.</p>
                                            </div>
                                            <a href="/my-appointments">View All</a>
                                        </div>
                                        <div class="dashboard-table-wrapper">
                                            <table class="dashboard-table">
                                                <thead>
                                                    <tr>
                                                        <th>ID</th>
                                                        <th>Doctor</th>
                                                        <th>Specialization</th>
                                                        <th>Date</th>
                                                        <th>Time</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${appointmentRows}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                </main>
                            </div>
                        </body>
                        </html>
                    `);
                }
            );
        }
    );
});

app.get("/my-appointments",requireRole("Patient"),(req, res) => {
        const patientId =req.session.user.patient_id;
        const sql = `
            SELECT
                a.appointment_id,
                a.appointment_date,
                a.appointment_time,
                a.reason,
                a.status,
                d.name AS doctor_name,
                d.specialization
            FROM appointments a
            JOIN doctors d
                ON a.doctor_id = d.doctor_id
            WHERE a.patient_id = ?
            ORDER BY
                a.appointment_date DESC,
                a.appointment_time DESC
        `;
        db.query(
            sql,
            [patientId],
            (err, results) => {
                if (err) {
                    console.error(
                        "My Appointments Error:",err
                    );
                    return res.status(500).send(
                        "Unable to load appointments."
                    );
                }
                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                        <td colspan="7">No appointments found.</td>
                        </tr>
                    `;
                }

                results.forEach(
                    appointment => {
                        const date =new Date(   
                                appointment.appointment_date
                            ).toLocaleDateString();

                        rows += `
                            <tr>
                                <td>${appointment.appointment_id}</td>
                                <td>${escapeHtml(String(appointment.doctor_name || ""))}</td>
                                <td>${escapeHtml(String(appointment.specialization || "-"))}</td>
                                <td>${date}</td>
                                <td>${appointment.appointment_time}</td>
                                <td>${escapeHtml(String(appointment.reason || "-"))}</td>
                                <td>${escapeHtml(String(appointment.status || "Pending"))}</td>
                            </tr>
                        `;
                    }
                );

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">

                        <title>My Appointments</title>

                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1100px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #333;}
                            table {width: 100%; border-collapse: collapse; margin-top: 20px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #007bff; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            .btn {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                            .btn:hover {background-color: #0056b3;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>My Appointments</h2>
                            <p>
                                Logged in as:${req.session.user.username}
                            </p>

                            <table>
                                <tr>
                                    <th>ID</th>
                                    <th>Doctor</th>
                                    <th>Specialization</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/patient-dashboard"class="btn">
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.get("/my-prescriptions",requireRole("Patient"),(req, res) => {
        const patientId =req.session.user.patient_id;
        const sql = `
            SELECT
                p.prescription_id,
                p.medicine_name,
                p.dosage,
                p.instructions,
                p.prescribed_date,
                d.name AS doctor_name
            FROM prescriptions p
            JOIN appointments a
                ON p.appointment_id = a.appointment_id
            JOIN doctors d
                ON a.doctor_id = d.doctor_id
            WHERE a.patient_id = ?
            ORDER BY
                p.prescribed_date DESC
        `;

        db.query(
            sql,
            [patientId],
            (err, results) => {
                if (err) {
                    console.error(
                        "My Prescriptions Error:",err
                    );

                    return res.status(500).send(
                        "Unable to load prescriptions."
                    );
                }

                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="6">No prescriptions found.</td>    
                        </tr>
                    `;
                }

                results.forEach(
                    prescription => {
                        const date =new Date(
                                prescription.prescribed_date
                            ).toLocaleDateString();

                        rows += `
                            <tr>
                                <td>${prescription.prescription_id}</td>
                                <td>${escapeHtml(String(prescription.doctor_name || ""))}</td>
                                <td>${escapeHtml(String(prescription.medicine_name || ""))}</td>
                                <td>${escapeHtml(String(prescription.dosage || "-"))}</td>
                                <td>${escapeHtml(String(prescription.instructions || "-"))}</td>
                                <td>${date}</td>
                            </tr>
                        `;
                    }
                );

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>My Prescriptions</title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1100px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #333;}
                            table {width: 100%; border-collapse: collapse; margin-top: 20px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #28a745; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            .btn {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                            .btn:hover {background-color: #0056b3;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>My Prescriptions</h2>
                            <table>
                                <tr>
                                    <th>ID</th>
                                    <th>Doctor</th>
                                    <th>Medicine</th>
                                    <th>Dosage</th>
                                    <th>Instructions</th>
                                    <th>Date</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/patient-dashboard"class="btn">
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.get("/doctor-dashboard", requireRole("Doctor"), (req, res) => {
    const user = req.session.user;
    const doctorId = user.doctor_id;
    const statsSql = `
        SELECT
            (SELECT COUNT(DISTINCT patient_id)
             FROM appointments
             WHERE doctor_id = ?) AS total_patients,

            (SELECT COUNT(*)
             FROM appointments
             WHERE doctor_id = ?) AS total_appointments,

            (SELECT COUNT(*)
             FROM appointments
             WHERE doctor_id = ?
             AND appointment_date = CURDATE()
             AND status != 'Cancelled') AS today_appointments,

            (SELECT COUNT(*)
             FROM prescriptions p
             JOIN appointments a
                 ON p.appointment_id = a.appointment_id
             WHERE a.doctor_id = ?) AS total_prescriptions
    `;

    const scheduleSql = `
        SELECT
            a.appointment_id,
            p.name AS patient_name,
            a.appointment_date,
            a.appointment_time,
            a.reason,
            a.status
        FROM appointments a
        JOIN patients p
            ON a.patient_id = p.patient_id
        WHERE a.doctor_id = ?
        AND a.appointment_date >= CURDATE()
        AND a.status != 'Cancelled'
        ORDER BY a.appointment_date ASC, a.appointment_time ASC
        LIMIT 5
    `;

    db.query(
        statsSql,
        [doctorId, doctorId, doctorId, doctorId],
        (err, statsResults) => {
            if (err) {
                console.error("Doctor dashboard statistics error:", err);
                return res.status(500).send("Unable to load dashboard.");
            }
            db.query(
                scheduleSql,
                [doctorId],
                (err, scheduleResults) => {
                    if (err) {
                        console.error("Doctor dashboard schedule error:", err);
                        return res.status(500).send("Unable to load dashboard.");
                    }
                    const stats = statsResults[0];
                    let scheduleRows = scheduleResults.map(appointment => {
                        let statusClass = "status-pending";
                        if (appointment.status === "Confirmed") {
                            statusClass = "status-confirmed";
                        }
                        return `
                            <tr>
                                <td>#${appointment.appointment_id}</td>
                                <td>${escapeHtml(String(appointment.patient_name || ""))}</td>
                                <td>${escapeHtml(String(appointment.appointment_date || "").substring(0, 10))}</td>
                                <td>${escapeHtml(String(appointment.appointment_time || ""))}</td>
                                <td>${escapeHtml(String(appointment.reason || ""))}</td>
                                <td>
                                    <span class="${statusClass}">
                                        ${escapeHtml(String(appointment.status || ""))}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join("");

                    if (scheduleRows === "") {
                        scheduleRows = `
                            <tr>
                                <td colspan="6" class="empty-dashboard">
                                    No upcoming appointments.
                                </td>
                            </tr>
                        `;
                    }

                    const today = new Date().toLocaleDateString("en-MY", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    });

                    res.send(`
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Doctor Dashboard</title>
                            <link rel="stylesheet" href="/style.css">
                        </head>
                        <body class="dashboard-body">
                            <div class="dashboard-layout">
                                <aside class="dashboard-sidebar">
                                    <div class="sidebar-profile">
                                        <div class="profile-icon">
                                            D
                                        </div>
                                        <div>
                                            <h2>${escapeHtml(String(user.username || "Doctor"))}</h2>
                                            <p>${escapeHtml(String(user.email || ""))}</p>
                                        </div>
                                    </div>
                                    <a href="/logout" class="sidebar-logout">
                                        Log out
                                    </a>
                                    <nav class="sidebar-menu">
                                        <a href="/doctor-dashboard" class="active">
                                            Dashboard
                                        </a>
                                        <a href="/doctor-schedule">
                                            Daily Schedule
                                        </a>
                                        <a href="/doctor-patients">
                                            My Patients
                                        </a>
                                        <a href="/doctor-prescriptions">
                                            Prescriptions
                                        </a>
                                    </nav>
                                </aside>
                                <main class="dashboard-main">
                                    <div class="dashboard-header">
                                        <div>
                                            <p class="dashboard-label">
                                                Healthcare Appointment System
                                            </p>
                                            <h1>Dashboard</h1>
                                        </div>
                                        <div class="dashboard-date">
                                            <span>Today's Date</span>
                                            <strong>${today}</strong>
                                        </div>
                                    </div>
                                    <section class="welcome-panel">
                                        <div>
                                            <p>Welcome!</p>
                                            <h2>
                                                Dr. ${escapeHtml(String(user.username || "Doctor"))}
                                            </h2>
                                            <p>View your schedule, access patient records, update consultation notes and manage prescriptions.</p>
                                        </div>
                                        <a href="/doctor-schedule"
                                           class="dashboard-primary-button">
                                            View My Schedule
                                        </a>
                                    </section>
                                    <h2 class="dashboard-section-title">
                                        Status
                                    </h2>
                                    <section class="dashboard-stats">
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_patients}</strong>
                                                <span>My Patients</span>
                                            </div>
                                            <div class="stat-icon">
                                                P
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_appointments}</strong>
                                                <span>Appointments</span>
                                            </div>
                                            <div class="stat-icon">
                                                A
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.today_appointments}</strong>
                                                <span>Today's Schedule</span>
                                            </div>
                                            <div class="stat-icon">
                                                T
                                            </div>
                                        </div>
                                        <div class="dashboard-stat-card">
                                            <div>
                                                <strong>${stats.total_prescriptions}</strong>
                                                <span>Prescriptions</span>
                                            </div>
                                            <div class="stat-icon">
                                                Rx
                                            </div>
                                        </div>
                                    </section>
                                    <section class="dashboard-table-section">
                                        <div class="dashboard-section-header">
                                            <div>
                                                <h2>Upcoming Schedule</h2>
                                                <p>Your next scheduled patient appointments.</p>
                                            </div>
                                            <a href="/doctor-schedule"> View Full Schedule</a>
                                        </div>
                                        <div class="dashboard-table-wrapper">
                                            <table class="dashboard-table">
                                                <thead>
                                                    <tr>
                                                        <th>ID</th>
                                                        <th>Patient</th>
                                                        <th>Date</th>
                                                        <th>Time</th>
                                                        <th>Reason</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>${scheduleRows}</tbody>
                                            </table>
                                        </div>
                                    </section>
                                </main>
                            </div>
                        </body>
                        </html>
                    `);
                }
            );
        }
    );
});

app.get("/doctor-schedule",requireRole("Doctor"),(req, res) => {
        const doctorId =req.session.user.doctor_id;
        const sql = `
            SELECT
                a.appointment_id,
                a.appointment_date,
                a.appointment_time,
                a.reason,
                a.status,
                p.patient_id,
                p.name AS patient_name,
                p.phone,
                p.email
            FROM appointments a
            JOIN patients p
                ON a.patient_id = p.patient_id
            WHERE a.doctor_id = ?
            ORDER BY
                a.appointment_date ASC,
                a.appointment_time ASC
        `;

        db.query(
            sql,
            [doctorId],
            (err, results) => {
                if (err) {
                    console.error(
                        "Doctor Schedule Error:",err
                    );

                    return res.status(500).send(
                        "Unable to load doctor schedule."
                    );
                }

                let rows = "";

                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="8">No appointments found.</td>
                        </tr>
                    `;
                }
                results.forEach(
                    appointment => {
                        const date =new Date(
                                appointment.appointment_date
                            ).toLocaleDateString();

                        rows += `
                            <tr>
                                <td>${appointment.appointment_id}</td>
                                <td>${date}</td>
                                <td>${appointment.appointment_time}</td>
                                <td>${escapeHtml(String(appointment.patient_name || ""))}</td>
                                <td>${escapeHtml(String(appointment.phone || "-"))}</td>
                                <td>${escapeHtml(String(appointment.reason || "-"))}</td>
                                <td>${escapeHtml(String(appointment.status || "Pending"))}</td>                           
                                <td>${appointment.patient_id}</td>
                                    
                                
                            </tr>
                        `;
                    }
                );
                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Doctor Schedule</title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1200px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #333;}
                            table {width: 100%; border-collapse: collapse; margin-top: 20px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #007bff; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            .btn {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>My Schedule</h2>
                            <p>
                                Doctor:${req.session.user.username}
                            </p>
                            <table>
                                <tr>
                                    <th>Appointment ID</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Patient</th>
                                    <th>Phone</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th>Patient ID</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/doctor-dashboard"class="btn">
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.get("/doctor-patients",requireRole("Doctor"),(req, res) => {
        const doctorId =req.session.user.doctor_id;
        const sql = `
            SELECT DISTINCT
                p.patient_id,
                p.name,
                p.ic_number,
                p.phone,
                p.email,
                p.date_of_birth,
                p.gender,
                p.address

            FROM patients p
            JOIN appointments a
                ON p.patient_id = a.patient_id
            WHERE a.doctor_id = ?
            ORDER BY p.name ASC
        `;
        db.query(
            sql,
            [doctorId],
            (err, results) => {
                if (err) {
                    console.error(
                        "Doctor Patient Records Error:",
                        err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load patient records."
                        );
                }

                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="9">
                                No patient records found.
                            </td>
                        </tr>
                    `;

                } else {
                    results.forEach(patient => {
                        let dob = "-";
                        if (patient.date_of_birth) {
                            dob =new Date(patient.date_of_birth
                                ).toLocaleDateString();
                        }

                        rows += `
                            <tr>
                                <td>${patient.patient_id}</td>
                                <td>${escapeHtml(String(patient.name || ""))}</td>
                                <td>${escapeHtml(String(patient.ic_number || ""))}</td>
                                <td>${escapeHtml(String(patient.phone || "-"))}</td>
                                <td>${escapeHtml(String(patient.email || "-"))}</td>
                                <td>${dob}</td>
                                <td>${escapeHtml(String(patient.gender || "-"))}</td>
                                <td>${escapeHtml(String(patient.address || "-"))}</td>
                                <td><a href="/doctor-patient/${patient.patient_id}"class="view">
                                        View Record
                                    </a>
                                </td>
                            </tr>
                        `;
                    });
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>Patient Records</title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1250px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse; margin-top: 25px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            .view {display: inline-block; padding: 7px 12px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; text-decoration: none; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                My Patient Records
                            </h2>
                            <p>
                                Only patients who have appointments
                                with you are displayed.
                            </p>
                            <table>
                                <tr>
                                    <th>Patient ID</th>
                                    <th>Name</th>
                                    <th>IC Number</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>Date of Birth</th>
                                    <th>Gender</th>
                                    <th>Address</th>
                                    <th>Action</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/doctor-dashboard"class="back">
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// DOCTOR - VIEW PATIENT RECORD
app.get("/doctor-patient/:patientId",requireRole("Doctor"),(req, res) => {
        const doctorId =req.session.user.doctor_id;
        const patientId =req.params.patientId;
        const patientSQL = `
            SELECT DISTINCT
                p.patient_id,
                p.name,
                p.ic_number,
                p.phone,
                p.email,
                p.date_of_birth,
                p.gender,
                p.address

            FROM patients p
            JOIN appointments a
                ON p.patient_id = a.patient_id
            WHERE p.patient_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;

        db.query(
            patientSQL,
            [
                patientId,
                doctorId
            ],
            (err, patientResults) => {
                if (err) {
                    console.error(
                        "Patient Record Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load patient record."
                        );
                }
                if (patientResults.length === 0) {
                    return res
                        .status(403)
                        .send(`
                            <h2>Access Denied</h2>
                            <p>You do not have permission to view this patient record.</p>
                            <a href="/doctor-patients">
                                Back to Patient Records
                            </a>
                        `);
                }

                const patient =patientResults[0];
                const appointmentSQL = `
                    SELECT
                        appointment_id,
                        appointment_date,
                        appointment_time,
                        reason,
                        status

                    FROM appointments

                    WHERE patient_id = ?
                    AND doctor_id = ?

                    ORDER BY
                        appointment_date DESC,
                        appointment_time DESC
                `;

                db.query(
                    appointmentSQL,
                    [
                        patientId,
                        doctorId
                    ],
                    (err, appointments) => {

                        if (err) {
                            console.error(
                                "Patient Appointment History Error:",err
                            );

                            return res
                                .status(500)
                                .send(
                                    "Unable to load appointment history."
                                );
                        }

                        let appointmentRows = "";
                        if (appointments.length === 0) {
                            appointmentRows = `
                                <tr>
                                    <td colspan="6"> No appointment history found.</td>
                                </tr>
                            `;
                        } else {
                            appointments.forEach(
                                appointment => {
                                    const date =new Date(
                                            appointment.appointment_date
                                        ).toLocaleDateString();

                                    appointmentRows += `
                                        <tr>
                                            <td>${appointment.appointment_id}</td>
                                            <td>${date}</td>
                                            <td>${appointment.appointment_time}</td>
                                            <td>${escapeHtml(String(appointment.reason || "-"))}</td>
                                            <td>${escapeHtml(String(appointment.status || "Pending"))}</td>
                                            <td><ahref="/consultation/${appointment.appointment_id}"class="notes">
                                                    Consultation
                                                </a>
                                                    &nbsp;
                                                <a href="/doctor-prescription/add/${appointment.appointment_id}"class="prescription">
                                                    Add Prescription
                                                </a>
                                            </td>
                                        </tr>
                                    `;
                                }
                            );
                        }

                        let dob = "-";
                        if (patient.date_of_birth) {
                            dob =new Date(
                                    patient.date_of_birth
                                ).toLocaleDateString();
                        }

                        res.send(`
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport"content="width=device-width, initial-scale=1.0">
                                <title>
                                    Patient Record
                                </title>
                                <style>
                                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                    .container {width: 90%; max-width: 1100px; margin: 50px auto;}
                                    .card {background-color: white; padding: 25px; margin-bottom: 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                                    h2, h3 {color: #004680;}
                                    .info {line-height: 1.8;}
                                    table {width: 100%; border-collapse: collapse; margin-top: 20px;}
                                    th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                                    th {background-color: #004680; color: white;}
                                    .notes {display: inline-block; padding: 7px 12px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;}
                                    .back {display: inline-block; padding: 10px 18px; background-color: #6c757d; color: white; text-decoration: none; border-radius: 5px;}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="card">
                                        <h2>Patient Record</h2>
                                        <div class="info">
                                            <strong>Patient ID:</strong>${patient.patient_id}<br>
                                            <strong>Name:</strong>${escapeHtml(String(patient.name || ""))}<br>
                                            <strong>IC Number:</strong>${escapeHtml(String(patient.ic_number || ""))}<br>
                                            <strong>Phone:</strong>${escapeHtml(String(patient.phone || "-"))}<br>
                                            <strong>Email:</strong>${escapeHtml(String(patient.email || "-"))}<br>
                                            <strong>Date of Birth:</strong>${dob}<br>
                                            <strong>Gender:</strong>${escapeHtml(String(patient.gender || "-"))}<br>
                                            <strong>Address:</strong>${escapeHtml(String(patient.address || "-"))}
                                        </div>
                                    </div>
                                    <div class="card">
                                        <h3>Appointment History</h3>
                                        <table>
                                            <tr>
                                                <th>Appointment ID</th>
                                                <th>Date</th>
                                                <th>Time</th>
                                                <th>Reason</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                            ${appointmentRows}
                                        </table>
                                    </div>
                                    <a href="/doctor-patients"class="back">
                                        Back to Patient Records
                                    </a>
                                </div>
                            </body>
                            </html>
                        `);
                    }
                );
            }
        );
    }
);

app.get("/consultation/:appointmentId",requireRole("Doctor"),(req, res) => {
        const appointmentId =req.params.appointmentId;
        const doctorId =req.session.user.doctor_id;
        
        const sql = `
            SELECT
                a.appointment_id,
                a.appointment_date,
                a.appointment_time,
                a.reason,
                a.status,
                a.consultation_notes,
                p.patient_id,
                p.name AS patient_name,
                p.ic_number,
                p.phone

            FROM appointments a
            JOIN patients p
                ON a.patient_id = p.patient_id
            WHERE a.appointment_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;

        db.query(
            sql,
            [appointmentId, doctorId],
            (err, results) => {
                if (err) {
                    console.error(
                        "Consultation Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load consultation."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(403)
                        .send(
                            "Access Denied"
                        );
                }

                const appointment =results[0];

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <title>
                            Consultation Notes
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 700px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            .info {line-height: 1.8; margin-bottom: 25px;}
                            label {display: block; margin-bottom: 10px; font-weight: bold;}
                            textarea {width: 100%; min-height: 180px; padding: 12px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px;}
                            button {margin-top: 20px; padding: 12px 20px; background-color: #004680; color: white; border: none; border-radius: 5px; cursor: pointer;}
                            a {display: inline-block; margin-top: 20px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>Consultation Notes</h2>
                            <div class="info">
                                <strong>Patient:</strong>${escapeHtml(String(appointment.patient_name || ""))}<br>
                                <strong>IC Number:</strong>${appointment.ic_number}<br>
                                <strong>Reason:</strong>${escapeHtml(String(appointment.reason || "-"))}
                            </div>
                            <form method="POST"action="/consultation/${appointment.appointment_id}">
                                <label>Consultation Notes:</label>
                                <textarea name="consultation_notes"maxlength="1000"required>${escapeHtml(String(appointment.consultation_notes || ""))}</textarea>
                                <button type="submit">
                                    Save Notes
                                </button>
                            </form>
                            <a href="/doctor-patient/${appointment.patient_id}">
                                Back to Patient Record
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.post("/consultation/:appointmentId",requireRole("Doctor"),(req, res) => {
        const appointmentId =req.params.appointmentId;
        const doctorId =req.session.user.doctor_id;
        const consultationNotes =req.body.consultation_notes?.trim();
        if (!consultationNotes) {
            return res
                .status(400)
                .send("Consultation notes cannot be empty.");
        }

        if (consultationNotes.length > 1000) {
            return res
                .status(400)
                .send("Consultation notes cannot exceed 1000 characters.");
        }

        const sql = `
            UPDATE appointments
            SET consultation_notes = ?
            WHERE appointment_id = ?
            AND doctor_id = ?
        `;

        db.query(
            sql,
            [
                consultationNotes,
                appointmentId,
                doctorId
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Consultation Update Error:",err 
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to save consultation notes."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(403)
                        .send(
                            "Access Denied"
                        );
                }

                res.send(`
                    <div style="max-width: 500px;margin: 100px auto;font-family: Arial, sans-serif;text-align: center;">
                        <h2 style="color: #28a745;">Consultation Notes Saved</h2>
                        <p>The consultation notes were updated successfully.</p>
                        <a href="/consultation/${appointmentId}">
                            Back to Consultation
                        </a>
                    </div>
                `);
            }
        );
    }
);

// DOCTOR - ADD PRESCRIPTION PAGE
app.get("/doctor-prescription/add/:appointmentId",requireRole("Doctor"),(req, res) => {
        const appointmentId =req.params.appointmentId;
        const doctorId =req.session.user.doctor_id;

        const sql = `
            SELECT
                a.appointment_id,
                a.appointment_date,
                a.appointment_time,
                p.patient_id,
                p.name AS patient_name,
                d.name AS doctor_name

            FROM appointments a

            JOIN patients p
                ON a.patient_id = p.patient_id

            JOIN doctors d
                ON a.doctor_id = d.doctor_id

            WHERE a.appointment_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;

        db.query(
            sql,
            [
                appointmentId,
                doctorId
            ],
            (err, results) => {
                if (err) {
                    console.error(
                        "Prescription Appointment Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load appointment."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(403)
                        .send(`
                            <h2>Access Denied</h2>
                            <p>
                                You cannot create a prescription for this appointment.
                            </p>
                            <a href="/doctor-dashboard">
                                Back to Dashboard
                            </a>
                        `);
                }

                const appointment =results[0];            
                const date =new Date(
                        appointment.appointment_date
                    ).toLocaleDateString();

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>Add Prescription</title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 700px; margin: 50px auto;}
                            .card {background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            .info {line-height: 1.8; margin-bottom: 25px;}
                            label {display: block; margin-top: 15px; margin-bottom: 5px; font-weight: bold;}
                            input, textarea {width: 100%; padding: 11px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px;}
                            textarea {min-height: 100px; resize: vertical;}
                            button {margin-top: 20px; padding: 12px 20px; background-color: #004680; color: white; border: none; border-radius: 5px; cursor: pointer;}
                            button:hover {background-color: #00345f;}
                            .back {display: inline-block; margin-top: 20px; color: #004680;}
                        </style>
                    </head>

                    <body>
                        <div class="container">
                            <div class="card">
                                <h2>Add Prescription</h2>

                                <div class="info">
                                    <strong>Appointment ID:</strong>${appointment.appointment_id}<br>
                                    <strong>Patient:</strong>${escapeHtml(String(appointment.patient_name || ""))}<br>
                                    <strong>Doctor:</strong>${escapeHtml(String(appointment.doctor_name || ""))}<br>
                                    <strong>Appointment Date:</strong>${date}   
                                </div>

                                <form method="POST"action="/doctor-prescription/add/${appointment.appointment_id}">
                                    <label>
                                        Medicine Name:
                                    </label>
                                    <input type="text"name="medicine_name"required>
                                    <label>
                                        Dosage:
                                    </label>
                                    <input type="text"name="dosage"placeholder="Example: 500mg twice daily">
                                    <label>
                                        Instructions:
                                    </label>
                                    <textarea name="instructions"placeholder="Example: Take after meals"></textarea>
                                    <label>
                                        Prescribed Date:
                                    </label>
                                    <input type="date"name="prescribed_date"required>
                                    <button type="submit">Add Prescription</button>
                                </form>

                                <a href="/doctor-patient/${appointment.patient_id}"class="back">
                                    Back to Patient Record
                                </a>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

// ===============================
// DOCTOR - SAVE PRESCRIPTION
// ===============================

app.post(
    "/doctor-prescription/add/:appointmentId",
    requireRole("Doctor"),
    (req, res) => {

        const appointmentId =
            req.params.appointmentId;

        const doctorId =
            req.session.user.doctor_id;


        let {
            medicine_name,
            dosage,
            instructions,
            prescribed_date
        } = req.body;


        medicine_name =
            medicine_name?.trim();

        dosage =
            dosage?.trim();

        instructions =
            instructions?.trim();

        if (!medicine_name || !prescribed_date) {

            return res
                .status(400)
                .send(
                    "Medicine name and prescribed date are required."
                );
        }

        const checkSQL = `
            SELECT
                appointment_id,
                patient_id

            FROM appointments

            WHERE appointment_id = ?
            AND doctor_id = ?

            LIMIT 1
        `;


        db.query(
            checkSQL,
            [
                appointmentId,
                doctorId
            ],
            (err, results) => {

                if (err) {

                    console.error(
                        "Prescription Permission Error:",err
                        
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to create prescription."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(403)
                        .send(
                            "Access Denied"
                        );
                }

                const patientId =results[0].patient_id;
                // INSERT PRESCRIPTION
                const insertSQL = `
                    INSERT INTO prescriptions
                    (
                        appointment_id,
                        medicine_name,
                        dosage,
                        instructions,
                        prescribed_date
                    )
                    VALUES (?, ?, ?, ?, ?)
                `;

                db.query(
                    insertSQL,
                    [
                        appointmentId,
                        medicine_name,
                        dosage || null,
                        instructions || null,
                        prescribed_date
                    ],
                    (err, result) => {
                        if (err) {
                            console.error(
                                "Prescription Insert Error:",err
                            );
                            return res
                                .status(500)
                                .send(
                                    "Unable to save prescription."
                                );
                        }

                        res.send(`
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <title>
                                    Prescription Added
                                </title>
                                <style>
                                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                                    h2 {color: #28a745;}
                                    p {color: #555;}
                                    a {display: inline-block; margin: 8px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h2>
                                        Prescription Added
                                    </h2>
                                    <p>
                                        The prescription was saved successfully.
                                    </p>
                                    <a href="/doctor-patient/${patientId}">
                                        Patient Record
                                    </a>
                                    <a href="/doctor-prescriptions">
                                        Prescription Management
                                    </a>
                                </div>
                            </body>
                            </html>
                        `);
                    }
                );
            }
        );
    }
);
// DOCTOR - PRESCRIPTION MANAGEMENT
app.get("/doctor-prescriptions",requireRole("Doctor"),(req, res) => {
        const doctorId =req.session.user.doctor_id;
        const sql = `
            SELECT
                pr.prescription_id,
                pr.appointment_id,
                pr.medicine_name,
                pr.dosage,
                pr.instructions,
                pr.prescribed_date,

                p.patient_id,
                p.name AS patient_name

            FROM prescriptions pr

            JOIN appointments a
                ON pr.appointment_id = a.appointment_id

            JOIN patients p
                ON a.patient_id = p.patient_id

            WHERE a.doctor_id = ?

            ORDER BY
                pr.prescribed_date DESC,
                pr.prescription_id DESC
        `;


        db.query(
            sql,
            [doctorId],
            (err, results) => {

                if (err) {

                    console.error(
                        "Doctor Prescriptions Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load prescriptions."
                        );
                }


                let rows = "";


                if (results.length === 0) {

                    rows = `
                        <tr>
                            <td colspan="8">
                                No prescriptions found.
                            </td>
                        </tr>
                    `;

                } else {

                    results.forEach(prescription => {

                        const date =
                            new Date(
                                prescription.prescribed_date
                            ).toLocaleDateString();


                        rows += `
                            <tr>
                                <td>${prescription.prescription_id}</td>
                                <td>${prescription.appointment_id}</td>
                                <td>${escapeHtml(String(prescription.patient_name || ""))}</td>
                                <td>${escapeHtml(String(prescription.medicine_name || ""))}</td>
                                <td>${escapeHtml(String(prescription.dosage || "-"))}</td>
                                <td>${escapeHtml(String(prescription.instructions || "-"))}</td>
                                <td>${date}</td>
                                <td>
                                    <a href="/doctor-prescription/edit/${prescription.prescription_id}">
                                        Edit
                                    </a>
                                    &nbsp; | &nbsp;
                                    <a
                                        href="/doctor-prescription/delete/${prescription.prescription_id}"
                                        onclick="return confirm('Are you sure you want to delete this prescription?');"
                                    >
                                        Delete
                                    </a>

                                </td>

                            </tr>
                        `;
                    });
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta
                            name="viewport"
                            content="width=device-width, initial-scale=1.0"
                        >

                        <title>
                            Prescription Management
                        </title>

                        <style>

                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1200px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse; margin-top: 25px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            a {color: #007bff;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; text-decoration: none; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                My Prescriptions
                            </h2>
                            <p>
                                Prescriptions created for your appointments.
                            </p>

                            <table>
                                <tr>
                                    <th>Prescription ID</th>
                                    <th>Appointment ID</th>
                                    <th>Patient</th>
                                    <th>Medicine</th>
                                    <th>Dosage</th>
                                    <th>Instructions</th>
                                    <th>Date</th>
                                    <th>Action</th>
                                </tr>
                                ${rows}
                            </table>

                            <a
                                href="/doctor-dashboard"
                                class="back"
                            >
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// DOCTOR - EDIT PRESCRIPTION PAGE
app.get("/doctor-prescription/edit/:id", requireRole("Doctor"),(req, res) => {
        const prescriptionId = req.params.id;
        const doctorId = req.session.user.doctor_id;

        const sql = `
            SELECT
                pr.prescription_id,
                pr.appointment_id,
                pr.medicine_name,
                pr.dosage,
                pr.instructions,
                pr.prescribed_date,

                p.patient_id,
                p.name AS patient_name

            FROM prescriptions pr
            JOIN appointments a
                ON pr.appointment_id = a.appointment_id
            JOIN patients p
                ON a.patient_id = p.patient_id
            WHERE pr.prescription_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;
        db.query(
            sql,
            [
                prescriptionId,
                doctorId
            ],
            (err, results) => {

                if (err) {

                    console.error(
                        "Prescription Edit Error:", err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load prescription."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(403)
                        .send(`
                            <h2>Access Denied</h2>
                            <p>
                                You cannot edit this prescription.
                            </p>
                            <a href="/doctor-prescriptions">
                                Back to Prescriptions
                            </a>
                        `);
                }

                const prescription = results[0];
                const prescribedDate =new Date(
                        prescription.prescribed_date
                    )
                    .toISOString()
                    .split("T")[0];

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>
                            Edit Prescription
                        </title>

                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 700px; margin: 50px auto;}
                            .card {background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            .info {line-height: 1.8; margin-bottom: 25px;}
                            label {display: block; margin-top: 15px; margin-bottom: 5px; font-weight: bold;}
                            input, textarea {width: 100%; padding: 11px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px;}
                            textarea {min-height: 100px; resize: vertical;}
                            button {margin-top: 20px; padding: 12px 20px; background-color: #004680; color: white; border: none; border-radius: 5px; cursor: pointer;}
                            button:hover {background-color: #00345f;}
                            .back {display: inline-block; margin-top: 20px; color: #004680;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="card">
                                <h2>
                                    Edit Prescription
                                </h2>
                                <div class="info">

                                    <strong>Prescription ID:</strong>${prescription.prescription_id}<br>
                                    <strong>Appointment ID:</strong>${prescription.appointment_id}<br>
                                    <strong>Patient:</strong>${escapeHtml(String(prescription.patient_name || ""))}
                                </div>


                                <form method="POST" action="/doctor-prescription/update/${prescription.prescription_id}">
                                    <label>
                                        Medicine Name:
                                    </label>
                                    <input
                                        type="text"
                                        name="medicine_name"
                                        value="${escapeHtml(String(prescription.medicine_name || ""))}"
                                        required
                                    >


                                    <label>
                                        Dosage:
                                    </label>

                                    <input
                                        type="text"
                                        name="dosage"
                                        value="${escapeHtml(String(prescription.dosage || ""))}"
                                    >


                                    <label>
                                        Instructions:
                                    </label>

                                    <textarea
                                        name="instructions"
                                    >${escapeHtml(String(prescription.instructions || ""))}</textarea>

                                    <label>
                                        Prescribed Date:
                                    </label>
                                    <input
                                        type="date"
                                        name="prescribed_date"
                                        value="${prescribedDate}"
                                        required
                                    >
                                    <button type="submit">
                                        Update Prescription
                                    </button>
                                </form>

                                <a
                                    href="/doctor-prescriptions"
                                    class="back"
                                >
                                    Back to Prescriptions
                                </a>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

// DOCTOR - UPDATE PRESCRIPTION
app.post("/doctor-prescription/update/:id",requireRole("Doctor"),(req, res) => {
        const prescriptionId = req.params.id;
        const doctorId = req.session.user.doctor_id;

        let {
            medicine_name,
            dosage,
            instructions,
            prescribed_date
        } = req.body;

        medicine_name = medicine_name?.trim();
        dosage = dosage?.trim();
        instructions = instructions?.trim();

        if (!medicine_name || !prescribed_date) {
            return res
                .status(400)
                .send(
                    "Medicine name and prescribed date are required."
                );
        }

        const checkSQL = `
            SELECT
                pr.prescription_id

            FROM prescriptions pr

            JOIN appointments a
                ON pr.appointment_id = a.appointment_id

            WHERE pr.prescription_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;

        db.query(
            checkSQL,
            [
                prescriptionId,
                doctorId
            ],
            (err, results) => {
                if (err) {

                    console.error(
                        "Prescription Permission Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to update prescription."
                        );
                }

                if (results.length === 0) {

                    return res
                        .status(403)
                        .send(
                            "Access Denied"
                        );
                }
                // UPDATE PRESCRIPTION
                const updateSQL = `
                    UPDATE prescriptions
                    SET
                        medicine_name = ?,
                        dosage = ?,
                        instructions = ?,
                        prescribed_date = ?
                    WHERE prescription_id = ?
                `;

                db.query(
                    updateSQL,
                    [
                        medicine_name,
                        dosage || null,
                        instructions || null,
                        prescribed_date,
                        prescriptionId
                    ],
                    (err, result) => {
                        if (err) {

                            console.error(
                                "Prescription Update Error:",err
                            );

                            return res
                                .status(500)
                                .send(
                                    "Unable to update prescription."
                                );
                        }

                        res.send(`
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <title>
                                    Prescription Updated
                                </title>
                                <style>
                                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                                    h2 {color: #28a745;}
                                    p {color: #555;}
                                    a {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h2>
                                        Prescription Updated
                                    </h2>
                                    <p>
                                        The prescription was
                                        updated successfully.
                                    </p>
                                    <a href="/doctor-prescriptions">
                                        Back to Prescriptions
                                    </a>
                                </div>
                            </body>
                            </html>
                        `);
                    }
                );
            }
        );
    }
);
// DOCTOR - DELETE PRESCRIPTION
app.get("/doctor-prescription/delete/:id",requireRole("Doctor"),(req, res) => {
        const prescriptionId = req.params.id;
        const doctorId = req.session.user.doctor_id;
        // CHECK OWNERSHIP
        const checkSQL = `
            SELECT
                pr.prescription_id
            FROM prescriptions pr
            JOIN appointments a
                ON pr.appointment_id = a.appointment_id
            WHERE pr.prescription_id = ?
            AND a.doctor_id = ?
            LIMIT 1
        `;

        db.query(
            checkSQL,
            [
                prescriptionId,
                doctorId
            ],
            (err, results) => {

                if (err) {

                    console.error(
                        "Prescription Delete Check Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to delete prescription."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(403)
                        .send(
                            "Access Denied"
                        );
                }

                const deleteSQL = `
                    DELETE FROM prescriptions
                    WHERE prescription_id = ?
                `;
                db.query(
                    deleteSQL,
                    [prescriptionId],
                    (err, result) => {
                        if (err) {
                            console.error(
                                "Prescription Delete Error:",err
                            );

                            return res
                                .status(500)
                                .send(
                                    "Unable to delete prescription."
                                );
                        }

                        res.send(`
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <title>
                                    Prescription Deleted
                                </title>
                                <style>
                                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                                    h2 {color: #dc3545;}
                                    p {color: #555;}
                                    a {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h2>
                                        Prescription Deleted
                                    </h2>
                                    <p>
                                        The prescription was
                                        deleted successfully.
                                    </p>
                                    <a href="/doctor-prescriptions">
                                        Back to Prescriptions
                                    </a>
                                </div>
                            </body>
                            </html>
                        `);
                    }
                );
            }
        );
    }
);

app.get("/admin-dashboard", requireRole("Admin"), (req, res) => {
    const user = req.session.user;
    const statsSql = `
        SELECT
            (SELECT COUNT(*) FROM doctors) AS total_doctors,
            (SELECT COUNT(*) FROM patients) AS total_patients,
            (SELECT COUNT(*) FROM appointments WHERE status = 'Pending') AS pending_appointments,
            (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE()) AS today_appointments
    `;
    const appointmentSql = `
        SELECT
            a.appointment_id,
            p.name AS patient_name,
            d.name AS doctor_name,
            a.appointment_date,
            a.appointment_time,
            a.status
        FROM appointments a
        JOIN patients p
            ON a.patient_id = p.patient_id
        JOIN doctors d
            ON a.doctor_id = d.doctor_id
        WHERE a.appointment_date >= CURDATE()
        ORDER BY a.appointment_date ASC, a.appointment_time ASC
        LIMIT 5
    `;
    db.query(statsSql, (err, statsResults) => {
        if (err) {
            console.error("Admin dashboard statistics error:", err);
            return res.status(500).send("Unable to load dashboard.");
        }
        db.query(appointmentSql, (err, appointmentResults) => {
            if (err) {
                console.error("Admin dashboard appointments error:", err);
                return res.status(500).send("Unable to load dashboard.");
            }
            const stats = statsResults[0];
            let appointmentRows = appointmentResults.map(appointment => {
                let statusClass = "status-pending";
                if (appointment.status === "Confirmed") {
                    statusClass = "status-confirmed";
                }
                if (appointment.status === "Cancelled") {
                    statusClass = "status-cancelled";
                }
                return `
                    <tr>
                        <td>#${appointment.appointment_id}</td>
                        <td>${escapeHtml(String(appointment.patient_name || ""))}</td>
                        <td>${escapeHtml(String(appointment.doctor_name || ""))}</td>
                        <td>${escapeHtml(String(appointment.appointment_date || "").substring(0, 10))}</td>
                        <td>${escapeHtml(String(appointment.appointment_time || ""))}</td>
                        <td><span class="${statusClass}">${escapeHtml(String(appointment.status || ""))}</span></td>
                    </tr>
                `;
            }).join("");
            if (appointmentRows === "") {appointmentRows = `
                    <tr>
                        <td colspan="6" class="empty-dashboard">
                            No upcoming appointments.
                        </td>
                    </tr>
                `;
            }
            const today = new Date().toLocaleDateString("en-MY", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            });

            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Dashboard</title>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body class="dashboard-body">
                    <div class="dashboard-layout">
                        <aside class="dashboard-sidebar">
                            <div class="sidebar-profile">
                                <div class="profile-icon">
                                    A
                                </div>
                                <div>
                                    <h2>Administrator</h2>
                                    <p>
                                        ${escapeHtml(String(user.email || ""))}
                                    </p>
                                </div>
                            </div>
                            <a href="/logout" class="sidebar-logout">Log out</a>
                            <nav class="sidebar-menu">
                                <a href="/admin-dashboard" class="active">Dashboard</a>
                                <a href="/patients">Patients</a>
                                <a href="/appointments">Appointments</a>
                                <a href="/availabilities">Doctor Availability</a>
                                <a href="/billing">Billing</a>
                                <a href="/reminders">Reminders</a>
                            </nav>
                        </aside>
                        <main class="dashboard-main">
                            <div class="dashboard-header">
                                <div>
                                    <p class="dashboard-label">
                                        Healthcare Appointment System
                                    </p>
                                    <h1>Dashboard</h1>
                                </div>
                                <div class="dashboard-date">
                                    <span>Today's Date</span>
                                    <strong>${today}</strong>
                                </div>
                            </div>
                            <section class="welcome-panel">
                                <div>
                                    <p>Welcome back,</p>
                                    <h2>${escapeHtml(String(user.username || "Administrator"))}</h2>
                                    <p>
                                        Manage patients, appointments, doctor availability,
                                        billing and appointment reminders from your dashboard.
                                    </p>
                                </div>
                                <a href="/appointments" class="dashboard-primary-button">View Appointments</a>
                            </section>
                            <h2 class="dashboard-section-title">
                                Status
                            </h2>
                            <section class="dashboard-stats">
                                <div class="dashboard-stat-card">
                                    <div>
                                        <strong>${stats.total_doctors}</strong>
                                        <span>Doctors</span>
                                    </div>
                                    <div class="stat-icon">
                                        +
                                    </div>
                                </div>
                                <div class="dashboard-stat-card">
                                    <div>
                                        <strong>${stats.total_patients}</strong>
                                        <span>Patients</span>
                                    </div>
                                    <div class="stat-icon">
                                        P
                                    </div>
                                </div>
                                <div class="dashboard-stat-card">
                                    <div>
                                        <strong>${stats.pending_appointments}</strong>
                                        <span>Pending Appointments</span>
                                    </div>
                                    <div class="stat-icon">
                                        B
                                    </div>
                                </div>
                                <div class="dashboard-stat-card">
                                    <div>
                                        <strong>${stats.today_appointments}</strong>
                                        <span>Today's Appointments</span>
                                    </div>
                                    <div class="stat-icon">
                                        T
                                    </div>
                                </div>
                            </section>
                            <section class="dashboard-table-section">
                                <div class="dashboard-section-header">
                                    <div>
                                        <h2>Upcoming Appointments</h2>
                                        <p>Quick view of the next scheduled appointments.</p>
                                    </div>
                                    <a href="/appointments">Show All Appointments</a>     
                                </div>
                                <div class="dashboard-table-wrapper">
                                    <table class="dashboard-table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Patient</th>
                                                <th>Doctor</th>
                                                <th>Date</th>
                                                <th>Time</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>${appointmentRows}</tbody>
                                    </table>
                                </div>
                            </section>
                        </main>
                    </div>
                </body>
                </html>
            `);
        });
    });
});

app.get("/patients",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT *
            FROM patients
            ORDER BY patient_id DESC
        `;
        db.query(
            sql,
            (err, results) => {
                if (err) {
                    console.error(
                        "View Patients Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load patients."
                        );
                }
                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="9"
                                style="text-align: center; padding: 20px;">
                                No patient records found.
                            </td>
                        </tr>
                    `;
                } else {
                    results.forEach(patient => {
                        let formattedDob = "N/A";
                        if (patient.date_of_birth) {
                            formattedDob =new Date(
                                    patient.date_of_birth
                                )
                                .toISOString()
                                .split("T")[0];
                        }

                        rows += `
                            <tr>
                                <td>${patient.patient_id}</td>
                                <td>${escapeHtml(String(patient.name || ""))}</td>
                                <td>${escapeHtml(String(patient.ic_number || ""))}</td>
                                <td>${escapeHtml(String(patient.phone || ""))}</td>
                                <td>${escapeHtml(String(patient.email || ""))}</td>
                                <td>${formattedDob}</td>
                                <td>${escapeHtml(String(patient.gender || ""))}</td>
                                <td>${escapeHtml(String(patient.address || ""))}</td>
                                
                                <td>
                                    <a class="edit"href="/patient/edit/${patient.patient_id}">
                                        Edit
                                    </a>
                                    &nbsp; | &nbsp;
                                    <a class="delete"href="/patient/delete/${patient.patient_id}"onclick="return confirm('Are you sure you want to delete this patient?');">
                                        Delete
                                    </a>
                                </td>
                            </tr>
                        `;
                    });
                }
                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Patient Management
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1300px; margin: 40px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            .header {display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            a {text-decoration: none;}
                            .add {display: inline-block; padding: 10px 18px; background-color: #28a745; color: white; border-radius: 5px;}
                            .edit {color: #007bff; font-weight: bold;}
                            .delete {color: #dc3545; font-weight: bold;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>
                                    Patient Management
                                </h2>
                                <a href="/admin-patient/add" class="add">
                                    + Register New Patient
                                </a>
                            </div>
                            <table>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>IC Number</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>DOB</th>
                                    <th>Gender</th>
                                    <th>Address</th>
                                    <th>Action</th>
                                </tr>
                                ${rows}
                            </table>
                            <a
                                href="/admin-dashboard"
                                class="back"
                            >
                                Back to Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.post("/patient/add",requireRole("Admin"),async (req, res) => {
    let {
        name,
        ic_number,
        phone,
        email,
        date_of_birth,
        gender,
        address
    } = req.body;

    name = name?.trim();
    ic_number = ic_number?.trim();
    phone = phone?.trim();
    email = email?.trim();
    gender = gender?.trim();
    address = address?.trim();

    // Reusable error page
    function showError(title, message) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>
                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                    .error-icon {font-size: 50px; margin-bottom: 10px;}
                    h2 {color: #d9534f; margin-bottom: 15px;}
                    p {color: #555; font-size: 16px; line-height: 1.6;}
                    .btn {display: inline-block; margin-top: 20px; padding: 12px 22px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px;}
                    .btn:hover {background-color: #0056b3;}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">⚠️</div>
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <a href="/admin-patient/add" class="btn">
                        Back to Patient Registration
                    </a>
                </div>
            </body>
            </html>
        `);
    }

    if (
        !name ||
        !ic_number ||
        !phone ||
        !email ||
        !date_of_birth ||
        !gender
    ) {
        return showError(
            "Missing Information",
            "Please fill in all required fields."
        );
    }

    const namePattern = /^[A-Za-z\s.'-]{2,100}$/;
    if (!namePattern.test(name)) {
        return showError(
            "Invalid Name",
            "Please enter a valid patient name."
        );
    }

    const icPattern = /^[0-9-]{6,20}$/;
    if (!icPattern.test(ic_number)) {
        return showError(
            "Invalid IC Number",
            "Please enter a valid IC number."
        );
    }

    const phonePattern = /^[0-9+\-\s]{8,20}$/;
    if (!phonePattern.test(phone)) {

        return showError(
            "Invalid Phone Number",
            "Please enter a valid phone number."
        );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        return showError(
            "Invalid Email Format",
            "Please enter a valid email address."
        );
    }

    const birthDate = new Date(date_of_birth);
    const today = new Date();
    if (
        isNaN(birthDate.getTime()) ||
        birthDate > today
    ) {

        return showError(
            "Invalid Date of Birth",
            "Date of birth cannot be in the future."
        );
    }

    const allowedGender = [
        "Male",
        "Female",
    ];

    if (!allowedGender.includes(gender)) {
        return showError(
            "Invalid Gender",
            "Please select a valid gender."
        );
    }

    try {

        const response = await axios.get(
            "http://apilayer.net/api/check",
            {
                params: {
                    access_key: process.env.MAILBOXLAYER_API_KEY,
                    email: email,
                    smtp: 1,
                    format: 1
                }
            }
        );

        const emailData = response.data;
        console.log(
            "Mailboxlayer Email Validation:",
            emailData
        );

        if (emailData.success === false) {
            console.error(
                "Mailboxlayer API Error:",
                emailData.error
            );

            return showError(
                "Email Validation Error",
                "The email validation service is currently unavailable."
            );
        }

        if (emailData.format_valid !== true) {
            return showError(
                "Invalid Email Address",
                "The email address format is invalid."
            );
        }

        if (emailData.mx_found !== true) {

            return showError(
                "Invalid Email Domain",
                "The email domain could not be verified."
            );
        }
        if (emailData.smtp_check !== true) {
            return showError(
                "Email Cannot Be Verified",
                "The email address could not be verified. Please use another email address."
            );
        }

        const sql = `
            INSERT INTO patients
            (
                name,
                ic_number,
                phone,
                email,
                date_of_birth,
                gender,
                address
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
            sql,
            [
                name,
                ic_number,
                phone,
                email,
                date_of_birth,
                gender,
                address
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Patient Insert Error:",err
                    );

                    return res.status(500).send(`
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Database Error</title>
                            <style>
                                body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                                .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                                .error-icon {font-size: 50px; margin-bottom: 10px;}
                                h2 {color: #d9534f; margin-bottom: 15px;}
                                p {color: #555; font-size: 16px; line-height: 1.6;}
                                .btn {display: inline-block; margin-top: 20px; padding: 12px 22px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px;}
                                .btn:hover {background-color: #0056b3;}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="error-icon">⚠️</div>
                                <h2>Database Error</h2>
                                <p>
                                    Unable to register the patient.
                                    Please try again.
                                </p>
                                <a href="/admin-patient/add" class="btn">
                                    Back to Patient Registration
                                </a>
                            </div>
                        </body>
                        </html>
                    `);
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Patient Registered</title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                            .success-icon {font-size: 55px; margin-bottom: 10px;}
                            h2 {color: #28a745; margin-bottom: 15px;}
                            p {color: #555; font-size: 16px; line-height: 1.6;}
                            .patient-id {background-color: #f1f3f5; padding: 12px; border-radius: 6px; margin-top: 20px;}
                            .btn {display: inline-block; margin: 10px 5px; padding: 12px 22px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px;}
                            .btn:hover {background-color: #0056b3;}
                            .btn-green {background-color: #28a745;}
                            .btn-green:hover {background-color: #218838;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="success-icon">✅</div>
                            <h2>
                                Patient Registered Successfully
                            </h2>
                            <p>
                                The patient's email address was successfully
                                verified using Mailboxlayer API.
                            </p>
                            <div class="patient-id">
                                <strong>Patient ID:</strong>${result.insertId}
                            </div>
                            <br>
                            <a href="/admin-patient/add" class="btn">
                                Register Another Patient
                            </a>
                            <a href="/patients" class="btn btn-green">
                                View Patients
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );

    } catch (error) {
        console.error(
            "Mailboxlayer API Error:",
            error.response?.data || error.message
        );

        return res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Email Validation Error</title>
                <style>
                    body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                    .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;}
                    .error-icon {font-size: 50px; margin-bottom: 10px;}
                    h2 {color: #d9534f; margin-bottom: 15px;}
                    p {color: #555; font-size: 16px; line-height: 1.6;}
                    .btn {display: inline-block; margin-top: 20px; padding: 12px 22px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px;}
                    .btn:hover {background-color: #0056b3;}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">⚠️</div>
                    <h2>
                        Email Validation Error
                    </h2>
                    <p>
                        Unable to connect to the email validation service.
                        Please try again.
                    </p>
                    <a href="/admin-patient/add" class="btn">
                        Back to Patient Registration
                    </a>
                </div>
            </body>
            </html>
        `);
    }
});
// EDIT PATIENT PAGE
app.get("/patient/edit/:id",requireRole("Admin"),(req, res) => {
        const patientId = req.params.id;
        const sql = `
            SELECT *
            FROM patients
            WHERE patient_id = ?
            LIMIT 1
        `;

        db.query(
            sql,
            [patientId],
            (err, results) => {
                if (err) {
                    console.error(
                        "Edit Patient Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load patient."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(404)
                        .send(
                            "Patient not found."
                        );
                }

                const patient =results[0];
                let dateOfBirth = "";
                if (patient.date_of_birth) {
                    dateOfBirth =new Date(
                            patient.date_of_birth
                        )
                        .toISOString()
                        .split("T")[0];
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Edit Patient
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 650px; margin: 50px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            label {display: block; margin-top: 15px; margin-bottom: 5px; font-weight: bold;}
                            input, select, textarea {width: 100%; padding: 11px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px;}
                            textarea {min-height: 100px; resize: vertical;}
                            button {margin-top: 20px; padding: 12px 20px; background-color: #004680; color: white; border: none; border-radius: 5px; cursor: pointer;}
                            button:hover {background-color: #00345f;}
                            .back {display: inline-block; margin-top: 20px; color: #004680;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Edit Patient
                            </h2>

                            <form method="POST"action="/patient/update/${patient.patient_id}">
                                <label>
                                    Name:
                                </label>
                                <input type="text" name="name" value="${escapeHtml(String(patient.name || ""))}"required>
                                <label>
                                    IC Number:
                                </label>
                                <input type="text"name="ic_number" value="${escapeHtml(String(patient.ic_number || ""))}"required>
                                <label>Phone:</label>
                                <input type="text"name="phone"value="${escapeHtml(String(patient.phone || ""))}""required>
                                <label>
                                    Email:
                                </label>
                                <input type="email"name="email"value="${escapeHtml(String(patient.email || ""))}"required>
                                <label>
                                    Date of Birth:
                                </label>
                                <input type="date"name="date_of_birth"value="${dateOfBirth}"required>
                                <label>
                                    Gender:
                                </label>
                                <select name="gender"required>
                                    <option value="Male"${patient.gender === "Male" ? "selected" : ""}>
                                        Male
                                    </option>

                                    <option value="Female"${patient.gender === "Female" ? "selected" : ""}>
                                        Female
                                    </option>
                                </select>
                                <label>Address:</label>
                                <textarea name="address">${escapeHtml(String(patient.address || ""))}</textarea>
                                <button type="submit">Update Patient</button>
                            </form>
                            <a href="/patients"class="back">
                                Back to Patient Management
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// UPDATE PATIENT
app.post("/patient/update/:id",requireRole("Admin"),(req, res) => {
        const patientId =req.params.id;
        let {
            name,
            ic_number,
            phone,
            email,
            date_of_birth,
            gender,
            address
        } = req.body;


        name = name?.trim();
        ic_number = ic_number?.trim();
        phone = phone?.trim();
        email = email?.trim();
        gender = gender?.trim();
        address = address?.trim();

        if (
            !name ||
            !ic_number ||
            !phone ||
            !email ||
            !date_of_birth ||
            !gender
        ) {

            return res
                .status(400)
                .send("Please fill in all required fields.");
        }

        const namePattern =/^[A-Za-z\s.'-]{2,100}$/;
        if (!namePattern.test(name)) {
            return res
                .status(400)
                .send("Please enter a valid patient name.");
        }

        const icPattern =/^[0-9-]{6,20}$/;
        if (!icPattern.test(ic_number)) {
            return res
                .status(400)
                .send("Please enter a valid IC number.");
        }

        const phonePattern =/^[0-9+\-\s]{8,20}$/;
        if (!phonePattern.test(phone)) {
            return res
                .status(400)
                .send("Please enter a valid phone number.");          
        }

        const emailPattern =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            return res
                .status(400)
                .send(
                    "Please enter a valid email address."
                );
        }

        const birthDate =new Date(date_of_birth);
        const today =new Date();
        if (
            isNaN(birthDate.getTime()) ||
            birthDate > today
        ) {
            return res
                .status(400)
                .send(
                    "Date of birth cannot be in the future."
                );
        }

        const allowedGender = [
            "Male",
            "Female"
        ];

        if (!allowedGender.includes(gender)) {
            return res
                .status(400)
                .send(
                    "Please select a valid gender."
                );
        }
        // UPDATE PATIENT
        const sql = `
            UPDATE patients

            SET
                name = ?,
                ic_number = ?,
                phone = ?,
                email = ?,
                date_of_birth = ?,
                gender = ?,
                address = ?
            WHERE patient_id = ?
        `;

        db.query(
            sql,
            [
                name,
                ic_number,
                phone,
                email,
                date_of_birth,
                gender,
                address || null,
                patientId
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Patient Update Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to update patient."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send(
                            "Patient not found."
                        );
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <title>
                            Patient Updated
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #28a745;}
                            p {color: #555;}
                            a {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Patient Updated
                            </h2>
                            <p>
                                Patient information was updated successfully.
                            </p>
                            <a href="/patients">
                                Back to Patient Management
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

// DELETE PATIENT
app.get("/patient/delete/:id",requireRole("Admin"),(req, res) => {
        const patientId =req.params.id;
        const sql = `DELETE FROM patients WHERE patient_id = ?   
        `;

        db.query(
            sql,
            [patientId],
            (err, result) => {

                if (err) {

                    console.error(
                        "Patient Delete Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(`
                            <h2>
                                Unable to Delete Patient
                            </h2>

                            <p>
                                This patient may have related records
                                in the system.
                            </p>

                            <a href="/patients">
                                Back to Patient Management
                            </a>
                        `);
                }


                if (result.affectedRows === 0) {

                    return res
                        .status(404)
                        .send(
                            "Patient not found."
                        );
                }


                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">

                    <head>

                        <meta charset="UTF-8">

                        <title>
                            Patient Deleted
                        </title>

                        <style>

                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}

                            .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}

                            h2 {color: #dc3545;}

                            p {color: #555;}

                            a {display: inline-block; margin-top: 20px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}

                        </style>

                    </head>

                    <body>

                        <div class="container">

                            <h2>
                                Patient Deleted
                            </h2>

                            <p>
                                The patient record was deleted successfully.
                            </p>

                            <a href="/patients">
                                Back to Patient Management
                            </a>

                        </div>

                    </body>

                    </html>
                `);
            }
        );
    }
);
// ADMIN - APPOINTMENT MANAGEMENT
app.get("/appointments",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT
                a.appointment_id,
                a.patient_id,
                a.doctor_id,
                p.name AS patient_name,
                d.name AS doctor_name,
                a.appointment_date,
                a.appointment_time,
                a.reason,
                a.status

            FROM appointments a
            JOIN patients p
                ON a.patient_id = p.patient_id
            JOIN doctors d
                ON a.doctor_id = d.doctor_id
            ORDER BY
                a.appointment_date DESC,
                a.appointment_time DESC
        `;

        db.query(
            sql,
            (err, results) => {
                if (err) {
                    console.error(
                        "Appointment Management Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load appointments."
                        );
                }

                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="9">
                                No appointments found.
                            </td>
                        </tr>
                    `;
                } else {
                    results.forEach(appointment => {
                        const date =new Date(
                            appointment.appointment_date)
                            .toISOString()
                            .split("T")[0];
                        rows += `
                            <tr>
                                <td>${appointment.appointment_id}</td>
                                <td>${escapeHtml(String(appointment.patient_name || ""))}<br>
                                    <small>
                                        ID: ${appointment.patient_id}
                                    </small>
                                </td>
                                <td>
                                    ${escapeHtml(String(appointment.doctor_name || ""))}<br>
                                    <small>ID: ${appointment.doctor_id}</small>
                                </td>
                                <td>${date}</td>
                                <td>${appointment.appointment_time}</td>
                                <td>${escapeHtml(String(appointment.reason || "-"))}</td>
                                <td>${escapeHtml(String(appointment.status || "Pending"))}</td>
                                <td>
                                    <a class="confirm"href="/appointment/confirm/${appointment.appointment_id}">
                                        Confirm
                                    </a>
                                    &nbsp; | &nbsp;
                                    <a class="cancel"href="/appointment/cancel/${appointment.appointment_id}"onclick="return confirm('Are you sure you want to cancel this appointment?');">
                                        Cancel
                                    </a>
                                </td>
                            </tr>
                        `;
                    });
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Appointment Management
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1300px; margin: 40px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse; margin-top: 20px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            a {text-decoration: none;}
                            .confirm {color: #28a745; font-weight: bold;}
                            .cancel {color: #dc3545; font-weight: bold;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Appointment Management
                            </h2>
                            <table>
                                <tr>
                                    <th>Appointment ID</th>
                                    <th>Patient</th>
                                    <th>Doctor</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th>Action</th>  
                                </tr>
                                ${rows}
                            </table>
                            <a
                                href="/admin-dashboard"
                                class="back"
                            >
                                Back to Admin Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// ADMIN - CONFIRM APPOINTMENT
app.get("/appointment/confirm/:id",requireRole("Admin"),(req, res) => {
        const appointmentId =req.params.id;
        const sql = `
            UPDATE appointments
            SET status = ?
            WHERE appointment_id = ?
        `;

        db.query(
            sql,
            [
                "Confirmed",
                appointmentId
            ],
            (err, result) => {

                if (err) {

                    console.error(
                        "Confirm Appointment Error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to confirm appointment."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send("Appointment not found.");
                }
                res.redirect("/appointments");
            }
        );
    }
);
// ADMIN - CANCEL APPOINTMENT
app.get("/appointment/cancel/:id",requireRole("Admin"),(req, res) => {
        const appointmentId =req.params.id;
        const sql = `
            UPDATE appointments
            SET status = ?
            WHERE appointment_id = ?
        `;

        db.query(
            sql,
            [
                "Cancelled",
                appointmentId
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Cancel Appointment Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to cancel appointment."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send(
                            "Appointment not found."
                        );
                }
                res.redirect("/appointments"); 
            }
        );
    }
);
// ADMIN - ADD DOCTOR AVAILABILITY PAGE
app.get("/admin-availability/add",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT
                doctor_id,
                name,
                specialization
            FROM doctors
            ORDER BY name ASC
        `;

        db.query(
            sql,
            (err, doctors) => {
                if (err) {
                    console.error(
                        "Load Doctors Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load doctors."
                        );
                }

                let doctorOptions = `
                    <option value="">
                        Select Doctor
                    </option>
                `;
                doctors.forEach(doctor => {
                    doctorOptions += `
                        <option value="${doctor.doctor_id}">
                            ${escapeHtml(String(doctor.name || ""))} - ${escapeHtml(String(doctor.specialization || ""))}
                        </option>
                    `;
                });

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Add Doctor Availability
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 600px; margin: 50px auto; background-color: white; padding: 35px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680; text-align: center; margin-bottom: 30px;}
                            label {display: block; margin-top: 15px; margin-bottom: 6px; font-weight: bold;}
                            input, select {width: 100%; padding: 11px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px; font-size: 15px;}
                            button {width: 100%; margin-top: 25px; padding: 12px; background-color: #004680; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer;}
                            button:hover {background-color: #00345f;}
                            .back {display: block; margin-top: 20px; text-align: center; color: #004680; text-decoration: none;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Add Doctor Availability
                            </h2>
                            <form method="POST"action="/availability/add">
                                <label>
                                    Doctor:
                                </label>
                                <select name="doctor_id"required>
                                    ${doctorOptions}
                                </select>
                                <label>
                                    Available Date:
                                </label>
                                <input type="date"name="available_date"required>
                                <label>
                                    Start Time:
                                </label>
                                <input type="time"name="start_time"required>
                                <label>
                                    End Time:
                                </label>

                                <input type="time"name="end_time"required>
                                <button type="submit">
                                    Add Availability
                                </button>
                            </form>
                            <a
                                href="/availabilities"
                                class="back"
                            >
                                Back to Doctor Availability
                            </a>
                        </div>

                    </body>

                    </html>
                `);
            }
        );
    }
);
// ADMIN - VIEW DOCTOR AVAILABILITY
app.get("/availabilities",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT
                da.availability_id,
                da.doctor_id,
                d.name AS doctor_name,
                d.specialization,
                da.available_date,
                da.start_time,
                da.end_time

            FROM doctor_availability da
            JOIN doctors d
                ON da.doctor_id = d.doctor_id
            ORDER BY
                da.available_date ASC,
                da.start_time ASC
        `;

        db.query(
            sql,
            (err, results) => {
                if (err) {
                    console.error(
                        "Doctor Availability Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load doctor availability."
                        );
                }

                let rows = "";
                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="7">
                                No availability records found.
                            </td>
                        </tr>
                    `;
                } else {
                    results.forEach(availability => {
                        const date =new Date(
                                availability.available_date
                            )
                            .toISOString()
                            .split("T")[0];

                        rows += `
                            <tr>
                                <td>${availability.availability_id}</td>
                                <td>${escapeHtml(String(availability.doctor_name || ""))}</td>
                                <td>${escapeHtml(String(availability.specialization || "-"))}</td>   
                                <td>${date}</td>
                                <td>${availability.start_time}</td>
                                <td>${availability.end_time}</td>
                                <td>
                                    <a class="delete"href="/availability/delete/${availability.availability_id}"onclick="return confirm('Are you sure you want to delete this availability?');">
                                        Delete
                                    </a>
                                </td>
                            </tr>
                        `;
                    });
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Doctor Availability Management
                        </title>

                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1100px; margin: 40px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            .header {display: flex; justify-content: space-between; align-items: center;}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse; margin-top: 25px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            a {text-decoration: none;}
                            .add {display: inline-block; padding: 10px 18px; background-color: #28a745; color: white; border-radius: 5px;}
                            .delete {color: #dc3545; font-weight: bold;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; border-radius: 5px;}

                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>
                                    Doctor Availability Management
                                </h2>
                                <a href="/admin-availability/add"class="add">
                                    + Add Availability
                                </a>
                            </div>
                            <table>
                                <tr>
                                    <th>ID</th>
                                    <th>Doctor</th>
                                    <th>Specialization</th>
                                    <th>Date</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                    <th>Action</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/admin-dashboard"class="back">
                                Back to Admin Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.post("/availability/add",requireRole("Admin"),(req, res) => {
        let doctor_id = req.body.doctor_id;
        let available_date = req.body.available_date;
        let start_time = req.body.start_time;
        let end_time = req.body.end_time;
        let sql = `
            INSERT INTO doctor_availability
            (
                doctor_id,
                available_date,
                start_time,
                end_time
            )
            VALUES (?, ?, ?, ?)
        `;
        db.query(
            sql,
            [
                doctor_id,
                available_date,
                start_time,
                end_time
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Add Availability Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to add doctor availability."
                        );
                }
                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Availability Added
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 500px; margin: 100px auto; background-color: white; padding: 35px; text-align: center; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #28a745;}
                            a {display: inline-block; margin: 8px; padding: 10px 18px; background-color: #004680; color: white; text-decoration: none; border-radius: 5px;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Doctor Availability Added!
                            </h2>
                            <a href="/admin-availability/add">
                                Add Another Availability
                            </a>
                            <a href="/availabilities">
                                View Availability
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// ADMIN - DELETE DOCTOR AVAILABILITY
app.get("/availability/delete/:id",requireRole("Admin"),(req, res) => {
        const availabilityId =req.params.id;
        const sql = `
            DELETE FROM doctor_availability
            WHERE availability_id = ?
        `;
        db.query(
            sql,
            [availabilityId],
            (err, result) => {
                if (err) {
                    console.error(
                        "Delete Availability Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to delete availability."
                        );
                }
                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send(
                            "Availability record not found."
                        );
                }
                res.redirect(
                    "/availabilities"
                );
            }
        );
    }
);
// ADMIN - BILLING MANAGEMENT
app.get("/billing",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT
                b.bill_id,
                a.appointment_id,
                p.name AS patient_name,
                d.name AS doctor_name,
                b.amount,
                b.payment_status

            FROM billing b
            JOIN appointments a
                ON b.appointment_id = a.appointment_id
            JOIN patients p
                ON a.patient_id = p.patient_id
            JOIN doctors d
                ON a.doctor_id = d.doctor_id
            ORDER BY b.bill_id DESC
        `;

        db.query(
            sql,
            (err, results) => {
                if (err) {
                    console.error(
                        "Billing Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load billing records."
                        );
                }
                let rows = "";
                results.forEach(row => {
                    let statusBadge;
                    if (row.payment_status === "Paid") {
                        statusBadge = `
                            <span class="paid">
                                Paid
                            </span>
                        `;
                    } else {
                        statusBadge = `
                            <span class="pending">
                                Pending
                            </span>
                        `;
                    }
                    rows += `
                        <tr>
                            <td>#${row.bill_id}</td>
                            <td>#${row.appointment_id}</td>
                            <td>${escapeHtml(String(row.patient_name || ""))}</td>
                            <td>${escapeHtml(String(row.doctor_name || ""))}</td>
                            <td>RM ${Number(row.amount).toFixed(2)}</td>
                            <td>${statusBadge}</td>
                            <td>
                                <a href="/billing/status/${row.bill_id}"class="status">
                                    Update Status
                                </a>
                                &nbsp; | &nbsp;
                                <a href="/billing/delete/${row.bill_id}"class="delete"onclick="return confirm('Are you sure you want to delete this bill?');">
                                    Delete
                                </a>
                            </td>
                        </tr>
                    `;
                });

                if (results.length === 0) {
                    rows = `
                        <tr>
                            <td colspan="7"class="empty">
                                No billing records found.
                            </td>
                        </tr>
                    `;
                }

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"content="width=device-width, initial-scale=1.0">
                        <title>
                            Billing Management
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 95%; max-width: 1200px; margin: 40px auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            .header {display: flex; justify-content: space-between; align-items: center;}
                            h2 {color: #004680;}
                            table {width: 100%; border-collapse: collapse; margin-top: 25px;}
                            th, td {padding: 12px; border: 1px solid #ddd; text-align: left;}
                            th {background-color: #004680; color: white;}
                            tr:nth-child(even) {background-color: #f8f9fa;}
                            a {text-decoration: none;}
                            .add {display: inline-block; padding: 10px 18px; background-color: #28a745; color: white; border-radius: 5px;}
                            .paid {background-color: #e8f5e9; color: #2e7d32; padding: 5px 10px; border-radius: 5px; font-weight: bold;}
                            .pending {background-color: #ffebee; color: #c62828; padding: 5px 10px; border-radius: 5px; font-weight: bold;}
                            .status {color: #007bff; font-weight: bold;}
                            .delete {color: #dc3545; font-weight: bold;}
                            .back {display: inline-block; margin-top: 25px; padding: 10px 18px; background-color: #6c757d; color: white; border-radius: 5px;}
                            .empty {text-align: center;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>
                                    Billing Management
                                </h2>
                                <a href="/admin-billing/add"class="add">
                                    + Add New Bill
                                </a>
                            </div>
                            <table>
                                <tr>
                                    <th>Bill ID</th>
                                    <th>Appointment</th>
                                    <th>Patient</th>
                                    <th>Doctor</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                                ${rows}
                            </table>
                            <a href="/admin-dashboard" class="back">
                                Back to Admin Dashboard
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.post("/billing/add",requireRole("Admin"), (req, res) => {
    const { appointment_id, amount, payment_status } = req.body;
        if (!appointment_id ||!amount ||!payment_status)
         {
            return res
                .status(400)
                .send(
                    "All billing fields are required."
                );
        }
        if (isNaN(amount) ||Number(amount) <= 0)
         {
            return res
                .status(400)
                .send(
                    "Amount must be greater than RM 0."
                );
        }
        if (payment_status !== "Paid" &&payment_status !== "Pending")
         {
            return res
                .status(400)
                .send(
                    "Invalid payment status."
                );
        }

        const checkSql = `
            SELECT appointment_id
            FROM appointments
            WHERE appointment_id = ?
        `;

        db.query(
            checkSql,
            [appointment_id],
            (err, results) => {

                if (err) {
                    console.error(
                        "Billing Appointment Check Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Database Error"
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(400)
                        .send(
                            `Appointment ID #${appointment_id} does not exist.`
                        );
                }

                const insertSql = `
                    INSERT INTO billing
                    (
                        appointment_id,
                        amount,
                        payment_status
                    )
                    VALUES (?, ?, ?)
                `;

                db.query(
                    insertSql,
                    [
                        appointment_id,
                        amount,
                        payment_status
                    ],
                    (err, result) => {

                        if (err) {
                            console.error(
                                "Add Billing Error:",err
                            );

                            return res
                                .status(500)
                                .send(
                                    "Unable to add billing record."
                                );
                        }
                        res.redirect("/billing"); 
                    }
                );
            }
        );
    }
);
// ADMIN - ADD BILL PAGE
app.get("/admin-billing/add",requireRole("Admin"),(req, res) => {
        const sql = `
            SELECT
                a.appointment_id,
                p.name AS patient_name,
                d.name AS doctor_name,
                a.appointment_date

            FROM appointments a
            JOIN patients p
                ON a.patient_id = p.patient_id
            JOIN doctors d
                ON a.doctor_id = d.doctor_id
            ORDER BY a.appointment_date DESC
        `;

        db.query(
            sql,
            (err, appointments) => {
                if (err) {
                    console.error(
                        "Load Appointments Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to load appointments."
                        );
                }

                let appointmentOptions = `
                    <option value="">
                        Select Appointment
                    </option>
                `;

                appointments.forEach(appointment => {
                    const date =new Date(
                            appointment.appointment_date
                        )
                        .toISOString()
                        .split("T")[0];

                    appointmentOptions += `
                        <option value="${appointment.appointment_id}">
                            #${appointment.appointment_id}-
                             ${escapeHtml(String(appointment.patient_name || ""))}-
                             ${escapeHtml(String(appointment.doctor_name || ""))}- 
                             ${date}
                        </option>
                    `;
                });

                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>
                            Add Bill
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;}
                            .container {width: 90%; max-width: 600px; margin: 60px auto; background-color: white; padding: 35px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680; text-align: center;}
                            label {display: block; margin-top: 18px; margin-bottom: 6px; font-weight: bold;}
                            input, select {width: 100%; padding: 11px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 5px; font-size: 15px;}
                            button {width: 100%; margin-top: 25px; padding: 12px; background-color: #004680; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer;}
                            .back {display: block; margin-top: 20px; text-align: center; color: #004680; text-decoration: none;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Add New Bill
                            </h2>
                            <form method="POST" action="/billing/add">
                                <label>
                                    Appointment:
                                </label>
                                <select name="appointment_id" required>
                                    ${appointmentOptions}
                                </select>
                                <label>
                                    Amount (RM):
                                </label>
                                <input type="number" name="amount" min="0.01" step="0.01"required>
                                <label>
                                    Payment Status:
                                </label>
                                <select name="payment_status"required>
                                    <option value="Pending">
                                        Pending
                                    </option>
                                    <option value="Paid">
                                        Paid
                                    </option>
                                </select>
                                <button type="submit">
                                    Add Bill
                                </button>
                            </form>
                            <a href="/billing" class="back" >
                                Back to Billing Management
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);
// ADMIN - UPDATE BILLING STATUS
app.get("/billing/status/:id",requireRole("Admin"),(req, res) => {
        const billId =req.params.id;
        const sql = `
            SELECT
                bill_id,
                amount,
                payment_status
            FROM billing
            WHERE bill_id = ?
        `;

        db.query(
            sql,
            [billId],
            (err, results) => {
                if (err) {
                    console.error(
                        "Billing Status Error:",
                        err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to load billing record."
                        );
                }

                if (results.length === 0) {
                    return res
                        .status(404)
                        .send(
                            "Billing record not found."
                        );
                }
                const bill = results[0];
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>
                            Update Payment Status
                        </title>
                        <style>
                            body {font-family: Arial, sans-serif; background-color: #f4f6f8;}
                            .container {width: 90%; max-width: 500px; margin: 80px auto; background-color: white; padding: 35px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);}
                            h2 {color: #004680;}
                            select {width: 100%; padding: 11px; margin-top: 8px; box-sizing: border-box;}
                            button {width: 100%; padding: 12px; margin-top: 20px; background-color: #004680; color: white; border: none; border-radius: 5px;}
                            a {display: block; margin-top: 20px; text-align: center;}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>
                                Update Payment Status
                            </h2>
                            <p>
                                Bill ID: #${bill.bill_id}
                            </p>
                            <p>
                                Amount: RM ${Number(bill.amount).toFixed(2)}
                            </p>
                            <form method="POST" action="/billing/status/${bill.bill_id}">
                                <label>
                                    Payment Status:
                                </label>
                                <select name="payment_status" required>
                                    <option value="Pending"${bill.payment_status === "Pending" ? "selected" : ""}>
                                        Pending
                                    </option>
                                    <option value="Paid"${bill.payment_status === "Paid" ? "selected" : ""}>
                                        Paid
                                    </option>
                                </select>
                                <button type="submit">
                                    Update Status
                                </button>
                            </form>
                            <a href="/billing">
                                Back to Billing Management
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
        );
    }
);

app.post("/billing/status/:id",requireRole("Admin"),(req, res) => {
        const billId =req.params.id;
        const paymentStatus =
            req.body.payment_status;

        if (paymentStatus !== "Paid" &&paymentStatus !== "Pending")
         {
            return res
                .status(400)
                .send(
                    "Invalid payment status."
                );
        }

        const sql = `
            UPDATE billing
            SET payment_status = ?
            WHERE bill_id = ?
        `;

        db.query(
            sql,
            [
                paymentStatus,
                billId
            ],
            (err, result) => {
                if (err) {
                    console.error(
                        "Update Billing Error:",err
                    );
                    return res
                        .status(500)
                        .send(
                            "Unable to update payment status."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send(
                            "Billing record not found."
                        );
                }
                res.redirect("/billing");
            }
        );
    }
);

app.get("/billing/delete/:id", requireRole("Admin"),(req, res) => {
        const billId =req.params.id;
        const sql = `
            DELETE FROM billing
            WHERE bill_id = ?
        `;

        db.query(
            sql,
            [billId],
            (err, result) => {
                if (err) {
                    console.error(
                        "Delete Billing Error:",err
                    );

                    return res
                        .status(500)
                        .send(
                            "Unable to delete billing record."
                        );
                }

                if (result.affectedRows === 0) {
                    return res
                        .status(404)
                        .send(
                            "Billing record not found."
                        );
                }
                res.redirect("/billing");  
            }
        );
    }
);
// API Route - Get Appointment Reminders
app.get("/api/reminders", requireRole("Admin"), (req, res) => {
    const sql = `
        SELECT
            appointment_reminders.reminder_id AS id,
            appointments.appointment_id,
            patients.name AS patient_name,
            doctors.name AS doctor_name,
            appointments.appointment_date,
            appointments.appointment_time,
            appointment_reminders.reminder_message,
            appointment_reminders.created_at
        FROM appointment_reminders
        JOIN appointments
            ON appointment_reminders.appointment_id = appointments.appointment_id
        JOIN patients
            ON appointments.patient_id = patients.patient_id
        JOIN doctors
            ON appointments.doctor_id = doctors.doctor_id
        ORDER BY appointments.appointment_date,
                 appointments.appointment_time
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error loading reminders:", err);

            return res.status(500).json({
                error: "Unable to load reminders"
            });
        }

        res.json(results);
    });
});
// 9. Reminders Dashboard Route
app.get("/reminders", requireRole("Admin"), (req, res) => {
    let sql = `
        SELECT
            appointment_reminders.reminder_id,
            appointments.appointment_id,
            patients.name AS patient_name,
            doctors.name AS doctor_name,
            appointments.appointment_date,
            appointments.appointment_time,
            appointment_reminders.reminder_message,
            appointment_reminders.reminder_status
        FROM appointment_reminders
        JOIN appointments ON appointment_reminders.appointment_id = appointments.appointment_id
        JOIN patients ON appointments.patient_id = patients.patient_id
        JOIN doctors ON appointments.doctor_id = doctors.doctor_id
        ORDER BY appointments.appointment_date, appointments.appointment_time
    `;
    db.query(sql, (err, results) => {
        if (err) throw err;

        let rows = results.map(reminder => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">#${reminder.reminder_id}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;"><b>${escapeHtml(String(reminder.patient_name || ""))}</b></td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">${escapeHtml(String(reminder.doctor_name || ""))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">${escapeHtml(String(reminder.appointment_date || ""))} ${escapeHtml(String(reminder.appointment_time || ""))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">${escapeHtml(String(reminder.reminder_message || ""))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">${escapeHtml(String(reminder.reminder_status || ""))}</td>
            </tr>
        `).join('');

        res.send(`
            <div style="max-width: 1000px; margin: 30px auto; font-family: Arial, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; padding: 20px; background: #fff;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="color: #333; margin: 0;">🔔 Automated Reminders</h2>
                    <a href="/" style="background-color: #6c757d; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold;">🏠 Back to Home</a>
                </div>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px;">ID</th>
                            <th style="padding: 12px;">Patient</th>
                            <th style="padding: 12px;">Doctor</th>
                            <th style="padding: 12px;">Appointment Date</th>
                            <th style="padding: 12px;">Message</th>
                            <th style="padding: 12px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length > 0 ? rows : '<tr><td colspan="6" style="text-align: center; padding: 20px;">No reminders found.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `);
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(
                "Logout Error:",err
            );
            return res.status(500).send(
                "Unable to logout."
            );
        }
        res.redirect(
            "/index.html"
        );
    });
});

app.get("/api/drug/:name", async (req, res) => {
    try {
        // Get medicine name from URL
        const drugName = req.params.name;
        // Request data from openFDA
        const response = await axios.get(
            "https://api.fda.gov/drug/label.json",
            {
                params: {
                    search: `openfda.generic_name:"${drugName}"`,
                    limit: 1
                }
            }
        );
        // Get the first result
        const drug = response.data.results[0];
        const drugInformation = {
            generic_name:drug.openfda?.generic_name?.[0] || "Not available",
            brand_name:drug.openfda?.brand_name?.[0] || "Not available",
            manufacturer:drug.openfda?.manufacturer_name?.[0] || "Not available",
            purpose:drug.purpose?.[0] || drug.indications_and_usage?.[0] || "Not available",
            warnings:drug.warnings?.[0] || drug.warnings_and_cautions?.[0] || "Not available",
            dosage:drug.dosage_and_administration?.[0] || "Not available"
        };
        // Send normalized information to browser
        res.json({
            success: true,
            searched_drug: drugName,
            data: drugInformation
        });

    }
    catch (error) {
        console.error(
            "openFDA API Error:",
            error.message
        );
        res.status(404).json({
            success: false,
            error:"Drug information not found."
        });
    }
});

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000"
    );
});
