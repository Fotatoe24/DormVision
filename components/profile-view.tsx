"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { logout } from "@/lib/actions";
import { ArrowLeft } from "lucide-react";

const AVATAR_COLORS = [
  "#1f4d3d", // primary (ledger green)
  "#b8863b", // accent (brass)
  "#4b7a5e", // status-paid
  "#c99a3e", // status-partial
  "#8b8378", // status-unpaid
  "#b14833", // status-overdue
  "#1b1f1d", // ink
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Photo is too large — the limit is 3MB");
      return;
    }

    setUploadingPhoto(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Couldn't update your photo");
        return;
      }
      setAvatarUrl(dataUrl);
      toast.success("Profile photo updated");
      router.refresh();
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removePhoto() {
    setUploadingPhoto(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (!res.ok) {
        toast.error("Couldn't remove your photo");
        return;
      }
      setAvatarUrl(null);
      toast.success("Profile photo removed");
      router.refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveInfo() {
    setSavingInfo(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, avatarColor }),
    });
    const j = await res.json().catch(() => ({}));
    setSavingInfo(false);
    if (!res.ok) {
      toast.error(j.error ?? "Couldn't save your info");
      return;
    }
    toast.success("Profile updated");
    router.refresh();
  }

  async function changePassword() {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }

    setSavingPassword(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setSavingPassword(false);
    if (!res.ok) {
      toast.error(j.error ?? "Couldn't change your password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password changed");
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted/60 focus:border-primary focus:ring-1 focus:ring-primary";
  const labelClass = "mb-1.5 block text-xs font-medium text-foreground-muted";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
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
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-surface"
              style={{ background: avatarColor }}
            >
              {initials(fullName)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-semibold">
            {user.fullName}
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
                onClick={removePhoto}
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
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAvatarColor(c)}
                aria-label={`Use avatar color ${c}`}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  avatarColor === c ? "border-foreground" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={saveInfo}
          disabled={savingInfo}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {savingInfo ? "Saving…" : "Save changes"}
        </button>
      </div>

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
          onClick={changePassword}
          disabled={savingPassword}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {savingPassword ? "Saving…" : "Change password"}
        </button>
      </div>

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
