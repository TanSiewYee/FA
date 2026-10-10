# Project Title
Healthcare Appointment & Patient Management System

# Group Members
- Tan Siew Yee   QIU202510-008615

# Tools and Technologis used
- HTML - Creates the structure and forms of the website
- CSS  - Styles the website and provides a responsive layout
- JavaScript - Provides client-side validation and user interaction
- Node.js - Runs the server-side JavaScript application
- Express.js - Handles routes, requests, responses, and server operations
- MySQL - Stores patients, doctors, appointments, billing, consultation, availability, and reminder data
- mysql2 - Connects the Node.js application to the MySQL database
- Visual Studio Code - Used to write and manage the project source code
- Web Browser - Used to access and test the web application

# Steps to Run the Project
1. Install Required Software

Make sure the following software is installed:

Node.js
MySQL
Visual Studio Code or another code editor
A web browser such as Google Chrome or Microsoft Edge
2. Open the Project

Open the project folder in Visual Studio Code.

3. Install Dependencies

Open the terminal inside the project folder and run:

npm install

If the required packages have not been added to the project, install Express and MySQL2:

npm install express mysql2
4. Set Up the Database

Open MySQL and create the database:

CREATE DATABASE healthcare_db;

Select the database:
USE healthcare_db;

Then execute the SQL script provided with the project to create the required tables.

The system uses tables for:
Patients
Doctors
Doctor availability
Appointments
Consultation notes
Billing
Appointment reminders

5. Check the Database Connection
Make sure the MySQL configuration in the Node.js file matches your local MySQL settings.

Example:
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "healthcare_db"
});

Change the username and password if your MySQL configuration is different.

6. Start the Server
Run the Node.js application from the terminal:
node app.js

If your main server file has a different name, replace app.js with the correct filename.

7. Open the Website
After the server starts successfully, open a web browser and enter:
http://localhost:3000

The Healthcare Appointment & Patient Management System should now be available.

# Login Credentials
The provided project information does not specify a login/authentication system or default account credentials.

If a login function is added to the final project, enter the credentials below:

| Role   | Username        | Password   |
|--------|-----------------|------------|
| Admin  | `admin`         | `admin123` |
| Doctor | `aisyah.rahman` | `doctor123`|
| Doctor | `weiming.tan`   | `doctor123`|
