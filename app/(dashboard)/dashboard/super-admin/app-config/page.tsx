import type { Metadata } from "next";
import { getAppConfig } from "./actions";
import { AppConfigClient } from "./app-config-client";

export const metadata: Metadata = {
  title: "App Configuration",
  description:
    "Mobile app version gates, compulsory updates and maintenance mode.",
};

export default async function AppConfigPage() {
  const result = await getAppConfig();
  if (!result.success || !result.config) {
    throw new Error(result.error ?? "Could not load the app configuration.");
  }
  return <AppConfigClient config={result.config} />;
}
