import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-6 py-7 shadow-lift sm:py-8">
      <CardHeader className="gap-2 px-6 sm:px-8">
        <CardTitle className="font-display text-3xl leading-tight font-semibold tracking-tight">
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">{children}</CardContent>
    </Card>
  );
}
