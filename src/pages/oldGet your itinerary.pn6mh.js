import wixData from 'wix-data';

$w.onReady(function () {
  $w('#submitButton').onClick(handleSubmit);
});

async function handleSubmit() {
  const formData = {
    destination: $w('#destination').value,
    arrivalDate: $w('#arrivalDate').value,
    departureDate: $w('#departureDate').value,
    numTravelers: $w('#numTravelers').value,
    travelingWithKids: getKidsValue(),
    budget: $w('#budget').value,
    interests: $w('#interests').value,
    specialRequests: $w('#specialRequests').value,
    dietaryRestrictions: $w('#dietaryRestrictions').value,
    email: $w('#email').value
  };

  if (!formData.destination || !formData.arrivalDate || !formData.departureDate || !formData.email) {
    showError('Please fill destination, dates, and email.');
    return;
  }

  $w('#submitButton').disable();
  showMessage("Thanks — we’ve received your details. We’ll send your plan by email.");

  try {
    const leadItem = {
      destination: formData.destination,
      arrivalDate: formData.arrivalDate,
      departureDate: formData.departureDate,
      numTravelers: formData.numTravelers,
      travelingWithKids: formData.travelingWithKids,
      budget: formData.budget,
      interests: formData.interests,
      specialRequests: formData.specialRequests,
      dietaryRestrictions: formData.dietaryRestrictions,
      email: formData.email,
      status: "new",
      source: "website",
      createdAt: new Date()
    };

    await wixData.insert("Leads", leadItem);
    $w('#submitButton').enable();
  } catch (err) {
    console.error(err);
    showError("Something went wrong while saving your request. Please try again.");
    $w('#submitButton').enable();
  }
}

function showError(msg) {
  $w('#itineraryText').text = msg;
  $w('#itineraryContainer').expand();
}

function showMessage(msg) {
  $w('#itineraryText').text = msg;
  $w('#itineraryContainer').expand();
}

function getKidsValue() {
  try {
    if ('checked' in $w('#travelingWithKids')) return $w('#travelingWithKids').checked;
  } catch (_) {}
  const v = String($w('#travelingWithKids').value || '').toLowerCase();
  return v.startsWith('y');
}

function clearForm() {
  $w('#destination').value = undefined;
  $w('#arrivalDate').value = null;
  $w('#departureDate').value = null;
  $w('#numTravelers').value = undefined;
  try { $w('#travelingWithKids').checked = false; } catch (_) {}
  $w('#budget').value = undefined;
  $w('#interests').value = [];
  $w('#specialRequests').value = "";
  $w('#dietaryRestrictions').value = undefined;
  $w('#email').value = "";
}
