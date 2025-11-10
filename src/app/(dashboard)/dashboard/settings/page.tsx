"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useUserPreferences } from "@/components/providers/UserPreferencesProvider";

interface ProfileFormState {
  username: string;
  email: string;
  avatarUrl: string;
}

interface ProfileResponse {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
}

const densityOptions = [
  { value: "comfortable", label: "Comfortable" },
  { value: "cozy", label: "Cozy" },
  { value: "compact", label: "Compact" },
] as const;

const layoutOptions = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
] as const;

const SettingsPage = () => {
  const { data: session, update } = useSession();
  const { preferences, updatePreference, resetPreferences } = useUserPreferences();

  const [profile, setProfile] = useState<ProfileFormState>({
    username: session?.user.username ?? "",
    email: session?.user.email ?? "",
    avatarUrl: session?.user.avatarUrl ?? "",
  });
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
        const data: ProfileResponse = await res.json();
        if (!cancelled) {
          setProfile({
            username: data.username ?? "",
            email: data.email ?? "",
            avatarUrl: data.avatarUrl ?? "",
          });
        }
      } catch (error) {
        console.error("[settings] Failed to load profile", error);
        if (!cancelled) {
          setProfileStatus({ type: "error", message: "Failed to load user profile." });
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const avatarPreview = useMemo(() => {
    if (profile.avatarUrl) {
      return profile.avatarUrl;
    }
    if (profile.username) {
      return "";
    }
    return undefined;
  }, [profile.avatarUrl, profile.username]);

  const handleProfileChange = (field: keyof ProfileFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const message = errorData?.error ?? "Failed to save profile changes.";
        throw new Error(message);
      }
      const data: ProfileResponse = await res.json();
      setProfile({
        username: data.username ?? "",
        email: data.email ?? "",
        avatarUrl: data.avatarUrl ?? "",
      });
      await update?.({
        user: {
          ...session?.user,
          username: data.username,
          email: data.email,
          avatarUrl: data.avatarUrl,
        },
      });
      setProfileStatus({ type: "success", message: "Profile updated successfully." });
    } catch (error: any) {
      console.error("[settings] Failed to save profile", error);
      setProfileStatus({ type: "error", message: error.message ?? "Failed to save profile changes." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordStatus(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const message = errorData?.error ?? "Failed to update password.";
        throw new Error(message);
      }
      setPasswordStatus({ type: "success", message: "Password updated successfully." });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("[settings] Failed to update password", error);
      setPasswordStatus({ type: "error", message: error.message ?? "Failed to update password." });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Box sx={{ pt: 1 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        User Settings
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Profile" subheader="Update your account details." />
            <CardContent>
              <Stack spacing={2.5}>
                {profileStatus ? (
                  <Alert severity={profileStatus.type}>{profileStatus.message}</Alert>
                ) : null}
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar
                    src={avatarPreview}
                    sx={{ width: 64, height: 64, bgcolor: "primary.main", fontSize: 24 }}
                  >
                    {profile.username ? profile.username.charAt(0).toUpperCase() : "U"}
                  </Avatar>
                  <Typography variant="body2" color="text.secondary">
                    Provide an absolute URL to show a custom avatar in the dashboard header.
                  </Typography>
                </Stack>
                <TextField
                  label="Username"
                  value={profile.username}
                  onChange={handleProfileChange("username")}
                  fullWidth
                  disabled={loadingProfile || savingProfile}
                  helperText="Visible across the dashboard and AI tools."
                />
                <TextField
                  label="Email address"
                  type="email"
                  value={profile.email}
                  onChange={handleProfileChange("email")}
                  fullWidth
                  disabled={loadingProfile || savingProfile}
                  helperText="Used for notifications and account recovery."
                />
                <TextField
                  label="Avatar image URL"
                  value={profile.avatarUrl}
                  onChange={handleProfileChange("avatarUrl")}
                  fullWidth
                  disabled={loadingProfile || savingProfile}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Security" subheader="Update your password regularly." />
            <CardContent>
              <Stack spacing={2.5}>
                {passwordStatus ? (
                  <Alert severity={passwordStatus.type}>{passwordStatus.message}</Alert>
                ) : null}
                <TextField
                  label="Current password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                  fullWidth
                  disabled={savingPassword}
                />
                <TextField
                  label="New password"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                  fullWidth
                  disabled={savingPassword}
                  helperText="Must be at least 8 characters."
                />
                <TextField
                  label="Confirm new password"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  fullWidth
                  disabled={savingPassword}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handlePasswordChange}
                    disabled={savingPassword}
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Interface Preferences" subheader="Customize how information is displayed." />
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Color Palette
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Primary"
                      type="color"
                      value={preferences.primaryColor}
                      onChange={(event) => updatePreference("primaryColor", event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Secondary"
                      type="color"
                      value={preferences.secondaryColor}
                      onChange={(event) => updatePreference("secondaryColor", event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Background"
                      type="color"
                      value={preferences.backgroundColor}
                      onChange={(event) => updatePreference("backgroundColor", event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Surface"
                      type="color"
                      value={preferences.highlightColor}
                      onChange={(event) => updatePreference("highlightColor", event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 1 }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="display-density-label">Display density</InputLabel>
                      <Select
                        labelId="display-density-label"
                        label="Display density"
                        value={preferences.displayDensity}
                        onChange={(event) =>
                          updatePreference("displayDensity", event.target.value as typeof preferences.displayDensity)
                        }
                      >
                        {densityOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="layout-mode-label">Dashboard layout</InputLabel>
                      <Select
                        labelId="layout-mode-label"
                        label="Dashboard layout"
                        value={preferences.dashboardLayout}
                        onChange={(event) =>
                          updatePreference("dashboardLayout", event.target.value as typeof preferences.dashboardLayout)
                        }
                      >
                        {layoutOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={3} flexWrap="wrap">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={preferences.showAdvancedAiStats}
                        onChange={(_, checked) => updatePreference("showAdvancedAiStats", checked)}
                      />
                    }
                    label="Show advanced AI analytics"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={preferences.enableTradeNotifications}
                        onChange={(_, checked) => updatePreference("enableTradeNotifications", checked)}
                      />
                    }
                    label="Enable trade notifications"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={preferences.enableSoundEffects}
                        onChange={(_, checked) => updatePreference("enableSoundEffects", checked)}
                      />
                    }
                    label="Enable sound effects"
                  />
                </Stack>

                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="outlined" onClick={resetPreferences}>
                    Reset to defaults
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SettingsPage;


