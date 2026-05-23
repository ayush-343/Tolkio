import React, { useState, useEffect } from "react";
import {
  UserIcon,
  Edit2Icon,
  ShuffleIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import useAuthUser from "../hooks/useAuthUser";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { LANGUAGES } from "../constants";
import { getLanguageFlag } from "../lib/flags.jsx";
import { capitalize } from "../lib/utils.js";

const SettingsPage = () => {
  const { authUser } = useAuthUser();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    profilePic: "",
    nativeLanguage: "",
    nativeProficiency: "",
    learningLanguage: "",
    learningProficiency: "",
    nativeLanguages: [],
    learningLanguages: [],
  });

  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (authUser) {
      const nativeLangs = authUser.nativeLanguages && authUser.nativeLanguages.length > 0
        ? authUser.nativeLanguages
        : authUser.nativeLanguage
          ? [{ language: authUser.nativeLanguage, proficiency: authUser.nativeProficiency || "N" }]
          : [];

      const learningLangs = authUser.learningLanguages && authUser.learningLanguages.length > 0
        ? authUser.learningLanguages
        : authUser.learningLanguage
          ? [{ language: authUser.learningLanguage, proficiency: authUser.learningProficiency || "A1" }]
          : [];

      setFormData({
        fullName: authUser.fullName || "",
        username: authUser.username || "",
        email: authUser.email || "",
        password: "",
        profilePic: authUser.profilePic || "",
        nativeLanguage: authUser.nativeLanguage || "",
        nativeProficiency: authUser.nativeProficiency || "",
        learningLanguage: authUser.learningLanguage || "",
        learningProficiency: authUser.learningProficiency || "",
        nativeLanguages: nativeLangs,
        learningLanguages: learningLangs,
      });
    }
  }, [authUser]);

  const handleRandomAvatar = () => {
    const isBoy = Math.random() > 0.5;
    const category = isBoy ? "boy" : "girl";
    const idx = isBoy
      ? Math.floor(Math.random() * 50) + 1
      : Math.floor(Math.random() * 50) + 51;

    const randomAvatar = `/avatars/${category}/AV${idx}.png`;
    setFormData({ ...formData, profilePic: randomAvatar });
    toast.success("Random profile picture generated!");
  };

  const handleAddNative = () => {
    setFormData((prev) => ({
      ...prev,
      nativeLanguages: [...prev.nativeLanguages, { language: "", proficiency: "N" }],
    }));
  };

  const handleAddLearning = () => {
    setFormData((prev) => ({
      ...prev,
      learningLanguages: [...prev.learningLanguages, { language: "", proficiency: "A1" }],
    }));
  };

  const handleRemoveNative = (index) => {
    setFormData((prev) => ({
      ...prev,
      nativeLanguages: prev.nativeLanguages.filter((_, i) => i !== index),
    }));
  };

  const handleRemoveLearning = (index) => {
    setFormData((prev) => ({
      ...prev,
      learningLanguages: prev.learningLanguages.filter((_, i) => i !== index),
    }));
  };

  const handleNativeChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = prev.nativeLanguages.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      });
      return { ...prev, nativeLanguages: updated };
    });
  };

  const handleLearningChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = prev.learningLanguages.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      });
      return { ...prev, learningLanguages: updated };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password;
      }

      // Filter out empty language fields before saving
      if (payload.nativeLanguages) {
        payload.nativeLanguages = payload.nativeLanguages.filter((l) => l.language !== "");
      }
      if (payload.learningLanguages) {
        payload.learningLanguages = payload.learningLanguages.filter((l) => l.language !== "");
      }

      const res = await axiosInstance.put("/users/profile", payload);
      queryClient.setQueryData(["authUser"], (oldData) => ({
        ...oldData,
        user: res.data,
      }));
      toast.success("Profile updated successfully!");
      setIsEditing(false);
      setFormData((prev) => ({ ...prev, password: "" }));
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
      <div className="flex-1 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl tracking-tight mb-2">
            Settings & Profile
          </h1>
          <p className="text-base-content/70">
            Manage your account details, languages, and preferences.
          </p>
        </div>

        {/* Profile Header Card */}
        <div className="card bg-base-200 shadow-sm border border-base-300">
          <div className="h-32 bg-primary/20 rounded-t-2xl"></div>
          <div className="p-6 pt-0 relative flex justify-between items-end">
            <div className="flex items-end -mt-10 space-x-4">
              <div className="relative">
                <div className="avatar">
                  <div className="w-24 rounded-full ring ring-base-100 ring-offset-base-100 ring-offset-2 bg-base-300">
                    {formData.profilePic ? (
                      <img src={formData.profilePic} alt="Profile" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-base-content/50">
                        <UserIcon size={32} />
                      </div>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <button
                    onClick={handleRandomAvatar}
                    className="btn btn-circle btn-sm btn-accent absolute bottom-0 right-0 shadow-sm"
                    title="Generate Random Avatar"
                  >
                    <ShuffleIcon size={14} />
                  </button>
                )}
              </div>
              <div className="mb-2">
                <h2 className="text-xl font-bold">
                  {formData.fullName || "Your Name"}
                </h2>
                <p className="text-sm text-base-content/60 flex items-center gap-1">
                  <span>📍</span> {authUser?.location || "No location set"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`btn btn-sm mb-2 ${isEditing ? "btn-ghost text-base-content/70" : "btn-outline hover:bg-base-300 hover:text-base-content"}`}
            >
              {isEditing ? "Cancel Edit" : "Edit Profile"}
            </button>
          </div>
        </div>

        {/* Account Details */}
        <div className="card bg-base-200 shadow-sm border border-base-300">
          <div className="card-body p-6">
            <h3 className="card-title text-lg border-b border-base-300 pb-4 mb-4">
              Account Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label text-xs pb-1">Display Name</label>
                <input
                  type="text"
                  className="input input-bordered w-full bg-base-100 disabled:bg-base-200/50 disabled:text-base-content/60"
                  value={formData.fullName}
                  disabled={!isEditing}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                />
              </div>
              <div className="form-control">
                <label className="label text-xs pb-1">Username</label>
                <input
                  type="text"
                  className="input input-bordered w-full bg-base-100 disabled:bg-base-200/50 disabled:text-base-content/60"
                  value={formData.username}
                  disabled={!isEditing}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                />
              </div>
              <div className="form-control md:col-span-2">
                <label className="label text-xs pb-1">Email Address</label>
                <input
                  type="email"
                  className="input input-bordered w-full bg-base-100 disabled:bg-base-200/50 disabled:text-base-content/60"
                  value={formData.email}
                  disabled={!isEditing}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <div className="form-control md:col-span-2">
                <label className="label text-xs pb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input input-bordered w-full bg-base-100 disabled:bg-base-200/50 disabled:text-base-content/60 pr-10"
                    placeholder={
                      isEditing ? "Leave blank to keep same" : "••••••••"
                    }
                    value={formData.password}
                    disabled={!isEditing}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-circle absolute inset-y-1 right-2 text-base-content/60 disabled:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={16} />
                    ) : (
                      <EyeIcon size={16} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel: Languages */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col space-y-6 pt-16">
        <div className="card bg-base-200 shadow-sm border border-base-300 flex-1">
          <div className="card-body p-6">
            <h3 className="card-title text-lg border-b border-base-300 pb-4 mb-4">
              My Languages
            </h3>

            <div className="space-y-6">
              {/* Native */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold tracking-widest text-base-content/70">
                    NATIVE
                  </span>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddNative}
                      className="btn btn-ghost btn-xs btn-circle font-bold text-lg"
                      title="Add native language"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {formData.nativeLanguages.map((langObj, index) => (
                    <div key={`native-${index}`} className="flex gap-2 items-center">
                      <select
                        className="select select-bordered select-sm w-full bg-base-100 disabled:bg-base-200/50 disabled:border-base-300 disabled:opacity-100"
                        value={langObj.language}
                        disabled={!isEditing}
                        onChange={(e) => handleNativeChange(index, "language", e.target.value)}
                      >
                        <option value="">Language</option>
                        {LANGUAGES.map((lang) => (
                          <option key={`native-opt-${lang}`} value={lang.toLowerCase()}>
                            {lang}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select select-bordered select-sm w-20 bg-base-100 disabled:bg-base-200/50 disabled:border-base-300 disabled:opacity-100"
                        value={langObj.proficiency}
                        disabled={!isEditing}
                        onChange={(e) => handleNativeChange(index, "proficiency", e.target.value)}
                      >
                        <option value="">Lvl</option>
                        <option value="N">Native</option>
                      </select>
                      {isEditing && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-circle text-error"
                          onClick={() => handleRemoveNative(index)}
                          title="Remove language"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {formData.nativeLanguages.length === 0 && !isEditing && (
                    <p className="text-xs text-base-content/50 italic">No native languages set.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {formData.nativeLanguages.map((langObj, index) => (
                    langObj.language && (
                      <div key={`native-badge-${index}`} className="badge badge-secondary gap-1 p-3">
                        {getLanguageFlag(langObj.language)}
                        <span>NATIVE: {capitalize(langObj.language)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Learning */}
              <div>
                <div className="flex justify-between items-center mb-3 mt-6">
                  <span className="text-xs font-bold tracking-widest text-base-content/70">
                    LEARNING
                  </span>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddLearning}
                      className="btn btn-ghost btn-xs btn-circle font-bold text-lg"
                      title="Add learning language"
                    >
                      +
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {formData.learningLanguages.map((langObj, index) => (
                    <div key={`learning-${index}`} className="flex gap-2 items-center">
                      <select
                        className="select select-bordered select-sm w-full bg-base-100 disabled:bg-base-200/50 disabled:border-base-300 disabled:opacity-100"
                        value={langObj.language}
                        disabled={!isEditing}
                        onChange={(e) => handleLearningChange(index, "language", e.target.value)}
                      >
                        <option value="">Language</option>
                        {LANGUAGES.map((lang) => (
                          <option key={`learning-opt-${lang}`} value={lang.toLowerCase()}>
                            {lang}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select select-bordered select-sm w-full max-w-[5rem] bg-base-100 disabled:bg-base-200/50 disabled:border-base-300 disabled:opacity-100"
                        value={langObj.proficiency}
                        disabled={!isEditing}
                        onChange={(e) => handleLearningChange(index, "proficiency", e.target.value)}
                      >
                        <option value="">Level</option>
                        <option value="A1">A1</option>
                        <option value="A2">A2</option>
                        <option value="B1">B1</option>
                        <option value="B2">B2</option>
                        <option value="C1">C1</option>
                        <option value="C2">C2</option>
                      </select>
                      {isEditing && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-circle text-error"
                          onClick={() => handleRemoveLearning(index)}
                          title="Remove language"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {formData.learningLanguages.length === 0 && !isEditing && (
                    <p className="text-xs text-base-content/50 italic">No learning languages set.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {formData.learningLanguages.map((langObj, index) => (
                    langObj.language && (
                      <div key={`learning-badge-${index}`} className="badge badge-accent gap-1 p-3">
                        {getLanguageFlag(langObj.language)}
                        <span>LEARNING: {capitalize(langObj.language)}{langObj.proficiency ? ` (${langObj.proficiency})` : ""}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Actions Mobile / Float bottom-right Desktop */}
      {isEditing && (
        <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50">
          <button
            className="btn btn-primary shadow-lg"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <span className="loading loading-spinner"></span> Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
