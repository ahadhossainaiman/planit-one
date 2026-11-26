import wixData from "wix-data";

$w.onReady(() => {
  $w("#createPartnerBtn").onClick(savePartner);
});

async function savePartner() {
  const item = {
    title: ($w("#businessName").value || "").trim(),
    partnerId: makePartnerId(),
    businessName: ($w("#businessName").value || "").trim(),
    contactName: ($w("#contactName").value || "").trim(),
    email: ($w("#email").value || "").trim(),
    phone: ($w("#phone").value || "").trim(),
    bookingUrl: ($w("#bookingUrl").value || "").trim(),
    city: $w("#city").value,
    description: ($w("#description").value || "").trim(),
    status: "pending",
    createdAt: new Date()
  };

  if (!item.businessName || !item.contactName || !item.email) {
    showMsg("Please fill Business Name, Contact Person, and Email.");
    return;
  }

  $w("#createPartnerBtn").disable();

  try {
    await wixData.insert("Partners", item);
    showMsg("Thanks — we received your details. We’ll get back to you shortly.");
    $w("#createPartnerBtn").enable();
  } catch (err) {
    console.error(err);
    showMsg("Something went wrong. Please try again.");
    $w("#createPartnerBtn").enable();
  }
}

function showMsg(text) {
  $w("#messageText").text = text;
  $w("#messageText").show();
}

function makePartnerId() {
  return "P-" + Date.now().toString(36).toUpperCase() + "-" +
         Math.random().toString(36).slice(2, 6).toUpperCase();
}
