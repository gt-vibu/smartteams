import type { ReactNode } from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
} from '@smarteam/ui';
import type { IconName } from '@smarteam/ui';

export function SetupStep({
  number,
  icon,
  title,
  description,
  status,
  children,
}: {
  number: string;
  icon: IconName;
  title: string;
  description: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/35 pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            {number}
          </span>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Icon className="size-4 text-primary" name={icon} />
              <CardTitle>{title}</CardTitle>
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <Badge
          className="mt-4 w-fit sm:mt-0"
          variant={status === 'Ready' ? 'success' : 'secondary'}
        >
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}
