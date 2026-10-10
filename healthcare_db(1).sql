-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 10, 2026 at 10:21 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `healthcare_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `appointments`
--

CREATE TABLE `appointments` (
  `appointment_id` int(11) NOT NULL,
  `patient_id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` time NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `status` enum('Booked','Confirmed','Completed','Cancelled') NOT NULL DEFAULT 'Booked',
  `consultation_notes` varchar(1000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `appointments`
--

INSERT INTO `appointments` (`appointment_id`, `patient_id`, `doctor_id`, `appointment_date`, `appointment_time`, `reason`, `status`, `consultation_notes`) VALUES
(3, 1, 1, '2026-09-17', '11:11:00', 'hjgvfghv', 'Booked', 'Patient attended consultation. Follow-up if symptoms continue.'),
(4, 1, 1, '2026-09-17', '11:14:00', 'zxscdf', 'Booked', NULL),
(5, 2, 2, '2026-09-17', '11:19:00', 'hjgvfghv', 'Booked', NULL),
(6, 3, 2, '2026-10-07', '11:15:00', 'erftgh', 'Booked', NULL),
(7, 4, 2, '2026-10-07', '12:00:00', 'werty8yty', 'Booked', NULL),
(8, 4, 5, '2026-10-10', '12:00:00', 'High blood pressure', 'Booked', NULL),
(9, 4, 5, '2026-10-10', '13:30:00', 'Stomach issues', 'Booked', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `appointment_reminders`
--

CREATE TABLE `appointment_reminders` (
  `reminder_id` int(11) NOT NULL,
  `appointment_id` int(11) NOT NULL,
  `reminder_message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reminder_status` varchar(20) NOT NULL DEFAULT 'Pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `appointment_reminders`
--

INSERT INTO `appointment_reminders` (`reminder_id`, `appointment_id`, `reminder_message`, `created_at`, `reminder_status`) VALUES
(1, 4, 'Reminder: You have an appointment on 2026-09-17 at 11:14.', '2026-09-16 19:12:00', 'Pending'),
(2, 5, 'Reminder: You have an appointment on 2026-09-17 at 11:19.', '2026-09-16 19:17:58', 'Pending'),
(3, 6, 'Reminder: You have an appointment on 2026-10-07 at 11:15.', '2026-10-06 15:07:46', 'Pending'),
(4, 7, 'Reminder: You have an appointment on 2026-10-07 at 12:00.', '2026-10-06 15:12:38', 'Pending'),
(5, 8, 'Reminder: You have an appointment on 2026-10-10 at 12:00.', '2026-10-09 13:22:20', 'Pending'),
(6, 9, 'Reminder: You have an appointment on 2026-10-10 at 13:30.', '2026-10-09 13:31:44', 'Pending');

-- --------------------------------------------------------

--
-- Table structure for table `billing`
--

CREATE TABLE `billing` (
  `bill_id` int(11) NOT NULL,
  `appointment_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_status` enum('Unpaid','Paid') NOT NULL DEFAULT 'Unpaid'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `billing`
--

INSERT INTO `billing` (`bill_id`, `appointment_id`, `amount`, `payment_status`) VALUES
(1, 3, 50.00, 'Unpaid');

-- --------------------------------------------------------

--
-- Table structure for table `doctors`
--

CREATE TABLE `doctors` (
  `doctor_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `specialization` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `doctors`
--

INSERT INTO `doctors` (`doctor_id`, `name`, `specialization`, `phone`, `email`) VALUES
(1, 'Dr Jane', 'Ophthalmology', '0146811627', 'drjane@gmail.com'),
(2, 'Dr Lim', 'Cardiology', '0189982713', 'drlee@gmail.com'),
(3, 'Dr. Ahmad Hakim', 'Cardiology', '0123456701', 'ahmad.hakim@gmail.com'),
(4, 'Dr. Siti Aisyah', 'Dermatology', '0123456702', 'siti.aisyah@gmail.com'),
(5, 'Dr. Daniel Lee', 'General Medicine', '0123456703', 'daniel.lee@gmail.com'),
(6, 'Dr. Nurul Huda', 'Pediatrics', '0123456704', 'nurul.huda@gmail.com'),
(7, 'Dr. Jason Lim', 'Orthopedics', '0123456705', 'jason.lim@gmail.com'),
(8, 'Dr. Aina Farhana', 'Obstetrics and Gynecology', '0123456706', 'aina.farhana@gmail.com'),
(9, 'Dr. Kumar Raj', 'Neurology', '0123456707', 'kumar.raj@gmail.com'),
(10, 'Dr. Michelle Tan', 'Ophthalmology', '0123456708', 'michelle.tan@clinic.com'),
(11, 'Dr. Amirul Zaki', 'Psychiatry', '0123456709', 'amirul.zaki@gmail.com'),
(12, 'Dr. Sarah Wong', 'ENT', '0123456710', 'sarah.wong@gmail.com');

-- --------------------------------------------------------

--
-- Table structure for table `doctor_availability`
--

CREATE TABLE `doctor_availability` (
  `availability_id` int(11) NOT NULL,
  `doctor_id` int(11) NOT NULL,
  `available_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `doctor_availability`
--

INSERT INTO `doctor_availability` (`availability_id`, `doctor_id`, `available_date`, `start_time`, `end_time`) VALUES
(1, 1, '2026-09-17', '10:00:00', '18:00:00'),
(2, 2, '2026-09-17', '11:17:00', '18:20:00'),
(3, 2, '2026-10-07', '11:00:00', '16:30:00'),
(4, 8, '2026-10-09', '12:05:00', '17:05:00'),
(5, 5, '2026-10-10', '11:00:00', '18:00:00');

-- --------------------------------------------------------

--
-- Table structure for table `patients`
--

CREATE TABLE `patients` (
  `patient_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `ic_number` varchar(30) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `patients`
--

INSERT INTO `patients` (`patient_id`, `name`, `ic_number`, `phone`, `email`, `password`, `date_of_birth`, `gender`, `address`) VALUES
(1, 'Tan wei ming', '060117-08-0036', '01136056197', 'puiyin@gmail.com', NULL, '2006-12-02', 'Male', '12 jln'),
(2, 'asd', '011101-01-0111', '0123456789', 'asd@gmail.com', NULL, '2001-11-11', 'Male', '8 jln'),
(3, 'Leong Xiao Mei', '001212-10-0122', '011-8888888', 'xiaomei@gmail.com', NULL, '2000-12-12', 'Female', '13, Jalan Harmoni 2 Taman Harmoni, 31400, Ipoh, Perak'),
(4, 'Tan Siew Yee', '001223-08-0120', '', 'siewyee2307@gmail.com', NULL, '2000-12-23', 'Female', '15, Jalan Harmoni 2 Taman Harmoni, 31400, Ipoh, Perak'),
(5, 'Tham Ah Ming', '010101-08-0121', '0123456789', 'tsymmmwjsn@gmail.com', NULL, '2001-01-01', 'Male', '11, Jalan Harmoni 2 Taman Harmoni, 31400, Ipoh, Perak'),
(7, 'Agnes', '030303-08-0126', '011-7777777', 'ssrsxr97@gmail.com', NULL, '2003-03-03', 'Female', '<script>alert(\"XSS Attack\")</script>');

-- --------------------------------------------------------

--
-- Table structure for table `prescriptions`
--

CREATE TABLE `prescriptions` (
  `prescription_id` int(11) NOT NULL,
  `appointment_id` int(11) NOT NULL,
  `medicine_name` varchar(100) NOT NULL,
  `dosage` varchar(100) DEFAULT NULL,
  `instructions` varchar(255) DEFAULT NULL,
  `prescribed_date` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `prescriptions`
--

INSERT INTO `prescriptions` (`prescription_id`, `appointment_id`, `medicine_name`, `dosage`, `instructions`, `prescribed_date`) VALUES
(1, 3, 'Ibuprofen', '200 mg', 'Take one tablet after food when required.', '2026-09-17'),
(2, 4, 'Paracetamol', '500mg twice daily', 'Take after meals', '2026-10-08');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('Patient','Doctor','Admin') NOT NULL,
  `patient_id` int(11) DEFAULT NULL,
  `doctor_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`user_id`, `username`, `email`, `password`, `role`, `patient_id`, `doctor_id`, `created_at`) VALUES
(1, 'SiewyeeTan', 'siewyee2307@gmail.com', '$2b$12$yQURCUFfyt9k38xEBBZp5.OU98KZb38bj8t7pgSbygmZ4m22fNgfS', 'Patient', 4, NULL, '2026-10-07 16:05:15'),
(2, 'Jane', 'drjane@gmail.com', '$2b$12$GWJ9IEw7v9hPCBQf2n9Xr.HK4ggx/ZBm26zs6VJgnfGIB9cPuRiR6', 'Doctor', NULL, 1, '2026-10-07 16:09:55'),
(3, 'admin', 'admin@gmail.com', '$2b$12$61/Nu7.0MoCqVaDLffU0/OPAFPgf/1HYqCjZeblso3naZfSQMM14S', 'Admin', NULL, NULL, '2026-10-08 13:09:44');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`appointment_id`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `appointment_reminders`
--
ALTER TABLE `appointment_reminders`
  ADD PRIMARY KEY (`reminder_id`),
  ADD UNIQUE KEY `uq_reminder_appointment` (`appointment_id`);

--
-- Indexes for table `billing`
--
ALTER TABLE `billing`
  ADD PRIMARY KEY (`bill_id`),
  ADD UNIQUE KEY `uq_bill_appointment` (`appointment_id`);

--
-- Indexes for table `doctors`
--
ALTER TABLE `doctors`
  ADD PRIMARY KEY (`doctor_id`);

--
-- Indexes for table `doctor_availability`
--
ALTER TABLE `doctor_availability`
  ADD PRIMARY KEY (`availability_id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- Indexes for table `patients`
--
ALTER TABLE `patients`
  ADD PRIMARY KEY (`patient_id`),
  ADD UNIQUE KEY `uq_patient_ic` (`ic_number`),
  ADD UNIQUE KEY `uq_patient_email` (`email`);

--
-- Indexes for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD PRIMARY KEY (`prescription_id`),
  ADD KEY `appointment_id` (`appointment_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `patient_id` (`patient_id`),
  ADD KEY `doctor_id` (`doctor_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `appointments`
--
ALTER TABLE `appointments`
  MODIFY `appointment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `appointment_reminders`
--
ALTER TABLE `appointment_reminders`
  MODIFY `reminder_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `billing`
--
ALTER TABLE `billing`
  MODIFY `bill_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `doctors`
--
ALTER TABLE `doctors`
  MODIFY `doctor_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `doctor_availability`
--
ALTER TABLE `doctor_availability`
  MODIFY `availability_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `patients`
--
ALTER TABLE `patients`
  MODIFY `patient_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `prescriptions`
--
ALTER TABLE `prescriptions`
  MODIFY `prescription_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `appointments`
--
ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `appointment_reminders`
--
ALTER TABLE `appointment_reminders`
  ADD CONSTRAINT `appointment_reminders_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `billing`
--
ALTER TABLE `billing`
  ADD CONSTRAINT `billing_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `doctor_availability`
--
ALTER TABLE `doctor_availability`
  ADD CONSTRAINT `doctor_availability_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD CONSTRAINT `prescriptions_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`appointment_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
