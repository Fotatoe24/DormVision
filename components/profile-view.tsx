"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { logout } from "@/lib/actions";
import { ArrowLeft } from "lucide-react";

const AVATAR_COLORS = [
  "#1f4d3d",
  "#b8863b",
  "#4b7a5e",
  "#c99a3e",
  "#8b8378",
  "#b14833",
  "#1b1f1d",
];

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

type ProfileUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarColor: string;
  avatarUrl: string | null;
  createdAt: string;
  dormName?: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
};

export function ProfileView({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState(user.fullName);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [phone, setPhone] = useState(user.phone ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(
    user.emergencyContactName ?? ""
  );
  const [emergencyContactNumber, setEmergencyContactNumber] = useState(
    user.emergencyContactNumber ?? ""
  );
  const [savingContact, setSavingContact] = useState(false);

  // ---------------------------------------------------------
  // Upload profile photo
  // ---------------------------------------------------------
  async function handlePhoto(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Photo is too large — the limit is 3MB.");
      return;
    }

    setUploadingPhoto(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/profile", {
        method: "PATCH",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Could not upload your photo.");
        return;
      }

      setAvatarUrl(data.avatarUrl ?? null);

      toast.success("Profile photo updated.");
      router.refresh();
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("Could not upload your photo.");
    } finally {
      setUploadingPhoto(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // ---------------------------------------------------------
  // Remove profile photo
  // ---------------------------------------------------------
  async function removePhoto() {
    setUploadingPhoto(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          avatarUrl: null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't remove your photo.");
        return;
      }

      setAvatarUrl(null);

      toast.success("Profile photo removed.");
      router.refresh();
    } catch (error) {
      console.error("Remove avatar error:", error);
      toast.error("Couldn't remove your photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // ---------------------------------------------------------
  // Save name + avatar color
  // ---------------------------------------------------------
  async function saveInfo() {
    setSavingInfo(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          avatarColor,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save your info.");
        return;
      }

      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      console.error("Save profile error:", error);
      toast.error("Couldn't save your info.");
    } finally {
      setSavingInfo(false);
    }
  }

  // ---------------------------------------------------------
  // Save contact details
  // ---------------------------------------------------------
  async function saveContact() {
    setSavingContact(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          emergencyContactName,
          emergencyContactNumber,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save your contact details.");
        return;
      }

      toast.success("Contact details saved.");
      router.refresh();
    } catch (error) {
      console.error("Save contact error:", error);
      toast.error("Couldn't save your contact details.");
    } finally {
      setSavingContact(false);
    }
  }

  // ---------------------------------------------------------
  // Change password
  // ---------------------------------------------------------
  async function changePassword() {
    if (!currentPassword) {
      toast.error("Enter your current password.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match.");
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't change your password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success("Password changed.");
    } catch (error) {
      console.error("Change password error:", error);
      toast.error("Couldn't change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";

  const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            router.push(user.role === "owner" ? "/admin" : "/tenant");
          }}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div>
          <p className="text-xs text-foreground-muted">Account</p>

          <h1 className="font-heading text-lg font-semibold text-primary">
            Profile settings
          </h1>
        </div>
      </div>

      {/* Avatar + identity */}
      <div className="mb-5 flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
        <div className="group relative flex-none">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void handlePhoto(e.target.files?.[0]);
            }}
          />

          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={fullName}
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-surface"
              style={{
                background: avatarColor,
              }}
            >
              {initials(fullName)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate font-heading text-base font-semibold">
            {fullName}
          </p>

          <p className="truncate text-xs text-foreground-muted">{user.email}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
              {user.role === "owner" ? "Owner" : "Tenant"}
            </span>

            {user.dormName && (
              <span className="text-xs text-foreground-muted">
                {user.dormName}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-xs font-medium">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="text-primary hover:underline disabled:opacity-50"
            >
              {uploadingPhoto
                ? "Uploading…"
                : avatarUrl
                ? "Change photo"
                : "Add photo"}
            </button>

            {avatarUrl && (
              <button
                type="button"
                onClick={() => void removePhoto()}
                disabled={uploadingPhoto}
                className="text-foreground-muted hover:text-status-overdue disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Your info */}
      <div className="mb-5 space-y-4 rounded-lg border border-border bg-surface p-5">
        <p className="font-heading text-sm font-semibold">Your info</p>

        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>

          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <p className={labelClass}>Avatar color</p>

          <p className="mb-1.5 text-xs text-foreground-muted">
            {avatarUrl
              ? "Used if you ever remove your profile photo."
              : "Shows behind your initials until you add a photo."}
          </p>

          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAvatarColor(color)}
                aria-label={`Use avatar color ${color}`}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  avatarColor === color
                    ? "border-foreground"
                    : "border-transparent"
                }`}
                style={{
                  background: color,
                }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void saveInfo()}
          disabled={savingInfo}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {savingInfo ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Contact details */}
      {user.role === "tenant" && (
        <div className="mb-5 space-y-4 rounded-lg border border-border bg-surface p-5">
          <div>
            <p className="font-heading text-sm font-semibold">
              Contact details
            </p>

            <p className="mt-0.5 text-xs text-foreground-muted">
              Kept on file for your dorm owner in case of an emergency.
            </p>
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Your phone number
            </label>

            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxxx"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="emergencyContactName" className={labelClass}>
                Emergency contact name
              </label>

              <input
                id="emergencyContactName"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Maria Santos"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="emergencyContactNumber" className={labelClass}>
                Emergency contact number
              </label>

              <input
                id="emergencyContactNumber"
                value={emergencyContactNumber}
                onChange={(e) => setEmergencyContactNumber(e.target.value)}
                placeholder="09xx xxx xxxx"
                className={inputClass}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void saveContact()}
            disabled={savingContact}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {savingContact ? "Saving…" : "Save contact details"}
          </button>
        </div>
      )}

      {/* Password */}
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <p className="font-heading text-sm font-semibold">Change password</p>

        <div>
          <label htmlFor="currentPassword" className={labelClass}>
            Current password
          </label>

          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            value={currentPassword}
            onChange={setCurrentPassword}
            className={inputClass}
            placeholder="••••••••"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="newPassword" className={labelClass}>
              New password
            </label>

            <PasswordInput
              id="newPassword"
              name="newPassword"
              value={newPassword}
              onChange={setNewPassword}
              className={inputClass}
              placeholder="min. 6 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm new password
            </label>

            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              className={inputClass}
              placeholder="min. 6 characters"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void changePassword()}
          disabled={savingPassword}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {savingPassword ? "Saving…" : "Change password"}
        </button>
      </div>

      {/* Sign out */}
      <form action={logout} className="mt-5">
        <button
          type="submit"
          className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
