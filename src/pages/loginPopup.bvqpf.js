import { loginUser } from 'backend/planitAuth.web';
import { local } from 'wix-storage-frontend';
import wixWindowFrontend from 'wix-window-frontend';

$w.onReady(function () {
    $w("#errorMsg").hide();

    $w("#signInBtn").onClick(async () => {
        const email = $w("#emailInput").value;
        const password = $w("#passwordInput").value;
        $w("#errorMsg").hide();

        // বাটন ডিজেবল এবং টেক্সট পরিবর্তন
        $w("#signInBtn").disable();
        $w("#signInBtn").label = "Signing...";

        // Empty validation
        if (!email || !password) {
            showError("Please enter your email and password.");
            resetButton();
            return;
        }

        // Email @ validation
        if (!email.includes("@")) {
            showError("Please enter a valid email address.");
            resetButton();
            return;
        }

        try {
            const response = await loginUser(email, password);
            
            // API রেসপন্স চেক করা 
            if (response.success && response.data) {
                // সঠিক পাথ থেকে টোকেন স্টোর করা
                local.setItem("access_token", response.data.access_token);
                local.setItem("refresh_token", response.data.refresh_token);
                
                // (ঐচ্ছিক) চাইলে ইউজারনেমও সেভ করে রাখতে পারেন
                local.setItem("user_name", response.data.user.first_name);

                // Success message - Green
                $w("#errorMsg").text = "Login successful!";
                $w("#errorMsg").style.color = "#008000";
                $w("#errorMsg").show();
                
                $w("#signInBtn").label = "Success!";

                // স্টোরেজ ঠিকমতো সেভ হওয়ার জন্য ১ সেকেন্ড সময় দিয়ে লাইটবক্স ক্লোজ করা
                setTimeout(() => {
                    wixWindowFrontend.lightbox.close({ loggedIn: true });
                }, 1000);
            } else {
                showError(response.message || "Invalid credentials.");
                resetButton();
            }

        } catch (error) {
            // Error message - Red
            showError("Invalid email or password.");
            resetButton();
        }
    });
    
    // Redirect to Register
    $w("#registerLinkTxt").onClick(() => {
        wixWindowFrontend.lightbox.close();
        setTimeout(() => wixWindowFrontend.openLightbox("registerPopup"), 300);
    });

    // এরর দেখানোর হেল্পার ফাংশন
    function showError(message) {
        $w("#errorMsg").text = message;
        $w("#errorMsg").style.color = "#FF0000";
        $w("#errorMsg").show();
    }

    // বাটন আগের অবস্থায় ফিরিয়ে আনার হেল্পার ফাংশন
    function resetButton() {
        $w("#signInBtn").enable();
        $w("#signInBtn").label = "Sign In"; 
    }
});