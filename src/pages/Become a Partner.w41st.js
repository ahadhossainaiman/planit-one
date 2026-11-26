import wixData from "wix-data";

// ==============================
// PAGE READY
// ==============================

$w.onReady(() => {
    $w("#createPartnerBtn").onClick(savePartner);
});

// ==============================
// SAVE PARTNER
// ==============================

async function savePartner() {

    const businessName = ($w("#businessName").value || "").trim();
    const contactName = ($w("#contactName").value || "").trim();
    const email = ($w("#email").value || "").trim();
    const phone = ($w("#phone").value || "").trim();
    const bookingUrl = ($w("#bookingUrl").value || "").trim();
    const city = ($w("#city").value || "").trim();
    const description = ($w("#description").value || "").trim();

    const item = {
        title: businessName,
        partnerId: makePartnerId(),
        businessName,
        contactName,
        email,
        phone,
        bookingUrl,
        city, // Partner free-text city
        description,
        status: "pending",
        createdAt: new Date()
    };

    // Required validation
    if (!item.businessName || !item.contactName || !item.email) {
        showMsg("Please fill Business Name, Contact Person, and Email.");
        return;
    }

    $w("#createPartnerBtn").disable();

    try {
        await wixData.insert("Partners", item);

        // Clear form
        $w("#businessName").value = "";
        $w("#contactName").value = "";
        $w("#email").value = "";
        $w("#phone").value = "";
        $w("#bookingUrl").value = "";
        $w("#city").value = "";
        $w("#description").value = "";

        showMsg("Thanks — we received your details. We’ll get back to you shortly.");

    } catch (err) {
        console.error("Partner Save Error:", err);
        showMsg("Something went wrong. Please try again.");
    } finally {
        $w("#createPartnerBtn").enable();
    }
}

// ==============================
// SHOW MESSAGE
// ==============================

function showMsg(text) {
    $w("#messageText").text = text;
    $w("#messageText").show();
}

// ==============================
// GENERATE PARTNER ID
// ==============================

function makePartnerId() {
    return "P-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random().toString(36).slice(2, 6).toUpperCase();
}
