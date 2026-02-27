console.log('Test script loaded');
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Test');
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        console.log('Login button found');
        loginBtn.addEventListener('click', () => {
            console.log('Login button clicked - Test');
        });
    } else {
        console.error('Login button not found');
    }
}); 