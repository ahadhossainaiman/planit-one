import { verifyEmail, resendVerification } from 'backend/planitAuth.web';
import { local } from 'wix-storage-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import wixLocationFrontend from 'wix-location-frontend'; 

$w.onReady(function () {
    $w("#errorMsg").hide();

    const pendingEmail = local.getItem("pending_verify_email");

    if (pendingEmail) {
        $w("#emailInput").value = pendingEmail;
    }

    // Verify Action
    $w("#verifyBtn").onClick(async () => {
        $w("#errorMsg").hide();

        const email = $w("#emailInput").value;
        const code = $w("#codeInput").value;

        // Empty validation
        if (!email || !code) {
            $w("#errorMsg").text = "Please enter your email and verification code.";
            $w("#errorMsg").style.color = "#FF0000";
            $w("#errorMsg").show();
            return;
        }

        // Email @ validation
        if (!email.includes("@")) {
            $w("#errorMsg").text = "Please enter a valid email address.";
            $w("#errorMsg").style.color = "#FF0000";
            $w("#errorMsg").show();
            return;
        }

        const originalVerifyText = $w("#verifyBtn").label;
        $w("#verifyBtn").label = "Verifying...";
        $w("#verifyBtn").disable();

        try {
            const response = await verifyEmail(email, code);

            // API রেসপন্স থেকে সঠিকভাবে টোকেন নেওয়া
            if (response.success && response.data) {
                local.setItem("access_token", response.data.access_token);
                local.setItem("refresh_token", response.data.refresh_token);
                local.removeItem("pending_verify_email");

                $w("#errorMsg").text = "Email verified successfully!";
                $w("#errorMsg").style.color = "#008000";
                $w("#errorMsg").show();
                $w("#verifyBtn").label = "Success!";

                // ১ সেকেন্ড অপেক্ষা করে লাইটবক্স ক্লোজ করে ড্যাশবোর্ডে রিডাইরেক্ট করা
                setTimeout(() => {
                    wixWindowFrontend.lightbox.close({ loggedIn: true });
                    wixLocationFrontend.to("/dashboard"); // এই লাইনটি masterPage-কে রিলোড করে বাটন আপডেট করে দেবে
                }, 1000);
            } else {
                showError(response.message || "Invalid or expired verification code.", originalVerifyText);
            }

        } catch (error) {
            showError("Invalid or expired verification code.", originalVerifyText);
        }
    });

    // Resend Code Action
    $w("#resendCodeBtn").onClick(async () => {
        $w("#errorMsg").hide();
        const email = $w("#emailInput").value;

        if (!email || !email.includes("@")) {
            $w("#errorMsg").text = "Please enter a valid email address.";
            $w("#errorMsg").style.color = "#FF0000";
            $w("#errorMsg").show();
            return;
        }

        try {
            await resendVerification(email);
            $w("#errorMsg").text = "New 6-digit code sent to your email.";
            $w("#errorMsg").style.color = "#008000";
            $w("#errorMsg").show();
        } catch (error) {
            $w("#errorMsg").text = "Failed to resend code.";
            $w("#errorMsg").style.color = "#FF0000";
            $w("#errorMsg").show();
        }
    });

    // এরর দেখানোর হেল্পার ফাংশন
    function showError(message, originalText) {
        $w("#errorMsg").text = message;
        $w("#errorMsg").style.color = "#FF0000";
        $w("#errorMsg").show();
        $w("#verifyBtn").label = originalText;
        $w("#verifyBtn").enable();
    }
});