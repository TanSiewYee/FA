function confirmDelete() {
    return confirm("Are you sure you want to cancel this appointment? You will need to select a new time slot if you rebook.");
}

function checkAppointment() {
    const date = document.getElementById("appointment_date").value;
    const time = document.getElementById("appointment_time").value;

    if (!date || !time) {
        alert("Please select your preferred date and time so we can arrange your visit.");
        return false;
    }
    return true;
}