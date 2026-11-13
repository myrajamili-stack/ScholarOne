import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import type { RegisterResponse } from "../../types/auth";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearStoredUser } from "../../utils/authStorage";
import "../../styles/auth.css";
import StudentRegistration from "../../components/StudentRegistration";
import ProviderRegistration from "../../components/ProviderRegistration";

function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerSubmitted, setProviderSubmitted] = useState(false);

  async function handleStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (formData.get("password") !== formData.get("confirm_password")) {
      setError("Passwords do not match. Please confirm your password again.");
      return;
    }
    if (!String(formData.get("full_name") || "").trim()) {
      setError("Please enter your full name.");
      return;
    }
    setIsSubmitting(true);

    try {
      clearStoredUser();

      const response = await api.post<RegisterResponse>("/auth/register", {
        full_name: String(formData.get("full_name") || "").trim(),
        email,
        password: formData.get("password"),
        phone_number: `${formData.get("dial_code")}${String(formData.get("phone_number") || "").trim().replace(/^0+/, "")}`,
        role: "student",
      });

      navigate("/login", {
        state: {
          message: "Account created successfully. Please log in to continue.",
          email: response.data.user.email,
        },
      });
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSponsorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (formData.get("password") !== formData.get("confirm_password")) {
      setError("Passwords do not match. Please confirm your password again.");
      return;
    }
    setIsSubmitting(true);

    try {
      clearStoredUser();

      await api.post<RegisterResponse>("/auth/register", {
        full_name: String(formData.get("full_name") || "").trim(),
        email,
        password: formData.get("password"),
        phone_number: `${formData.get("dial_code")}${String(formData.get("phone_number") || "").trim().replace(/^0+/, "")}`,
        role: "sponsor",
        organization_name: String(formData.get("organization_name") || "").trim(),
        organization_type: String(formData.get("organization_type") || "").trim(),
        website: String(formData.get("website") || "").trim(),
        confirm_password: formData.get("confirm_password"),
      });

      setProviderSubmitted(true);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create provider account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSponsor = searchParams.get("role") === "sponsor";
  if (!isSponsor) {
    return <StudentRegistration onSubmit={handleStudentSubmit} error={error} isSubmitting={isSubmitting} />;
  }

  return <ProviderRegistration onSubmit={handleSponsorSubmit} error={error} isSubmitting={isSubmitting} submitted={providerSubmitted} />;
}

export default RegisterPage;
