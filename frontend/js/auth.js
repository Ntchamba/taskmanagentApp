import { api, setToken, getToken } from "./api.js";

// Already signed in? Go straight to the dashboard.
if (getToken()) {
  window.location.href = "/dashboard.html";
}

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const errorBox = document.getElementById("error");
const toggleLink = document.getElementById("toggle-mode");
const titleEl = document.getElementById("form-title");
const subtitleEl = document.getElementById("form-subtitle");

let mode = "login"; // "login" | "signup"

function render() {
  const isLogin = mode === "login";
  titleEl.textContent = isLogin ? "Welcome back" : "Create your account";
  subtitleEl.textContent = isLogin
    ? "Log in to your account"
    : "Start organizing your tasks";
  submitBtn.textContent = isLogin ? "Log in" : "Sign up";
  toggleLink.textContent = isLogin
    ? "Need an account? Sign up"
    : "Already have an account? Log in";
  passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
  errorBox.textContent = "";
}

toggleLink.addEventListener("click", (event) => {
  event.preventDefault();
  mode = mode === "login" ? "signup" : "login";
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    errorBox.textContent = "Please enter your email address.";
    return;
  }
  if (password.length < 8) {
    errorBox.textContent = "Password must be at least 8 characters.";
    return;
  }

  submitBtn.disabled = true;
  try {
    const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
    const data = await api(endpoint, { method: "POST", body: { email, password } });
    setToken(data.token);
    window.location.href = "/dashboard.html";
  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

render();
