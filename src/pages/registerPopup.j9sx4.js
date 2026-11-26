import { signupUser } from 'backend/planitAuth.web';
import wixWindowFrontend from 'wix-window-frontend';
import { local } from 'wix-storage-frontend';

$w.onReady(function () {
    $w("#errorMsg").hide();

    $w("#createAccountBtn").onClick(async () => {
        $w("#errorMsg").hide();
        
        const userData = {
            first_name: $w("#firstNameInput").value,
            last_name: $w("#lastNameInput").value,
            email: $w("#emailInput").value,
            password: $w("#passwordInput").value
        };

        const originalBtnText = $w("#createAccountBtn").label;

        // Empty validation
        if (!userData.first_name || !userData.last_name || !userData.email || !userData.password) {
            showError("Please fill in all fields.");
            return;
        }

        // Email @ validation
        if (!userData.email.includes("@")) {
            showError("Please enter a valid email address.");
            return;
        }

        // Password length validation
        if (userData.password.length < 6) {
            showError("Password must be at least 6 characters.");
            return;
        }

        // API কল করার আগে বাটন ডিজেবল এবং টেক্সট চেঞ্জ করা
        $w("#createAccountBtn").label = "Account Creating...";
        $w("#createAccountBtn").disable();

        try {
            await signupUser(userData);
            local.setItem("pending_verify_email", userData.email);

            $w("#errorMsg").text = "Account created successfully!";
            $w("#errorMsg").style.color = "#008000";
            $w("#errorMsg").show();
            
            $w("#createAccountBtn").label = "Success!";
            
            // Redirect to Verify Popup (১ সেকেন্ড সময় দিয়ে)
            setTimeout(() => {
                wixWindowFrontend.lightbox.close();
                setTimeout(() => wixWindowFrontend.openLightbox("emailVerifyPopup"), 300);
            }, 1000);

        } catch (error) {
            // এরর আসলে বাটনটি আবার আগের অবস্থায় ফিরিয়ে আনা
            showError("Email already exists or invalid data.");
            $w("#createAccountBtn").label = originalBtnText;
            $w("#createAccountBtn").enable();
        }
    });

    // Redirect back to Login
    $w("#loginLinkTxt").onClick(() => {
        wixWindowFrontend.lightbox.close();
        setTimeout(() => wixWindowFrontend.openLightbox("loginPopup"), 300);
    });

    // এরর দেখানোর হেল্পার ফাংশন
    function showError(message) {
        $w("#errorMsg").text = message;
        $w("#errorMsg").style.color = "#FF0000";
        $w("#errorMsg").show();
    }
});