'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@smarteam/ui';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File,
  Loader2,
} from 'lucide-react';
import { useFiles } from '../../hooks/use-files';
import { formatBytes } from '../../utils/formatters';

function getFileIcon(fileName: string, mimeType?: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || mimeType?.includes('pdf')) {
    return <FileText className="h-4 w-4 text-rose-500" />;
  }
  if (
    ['xls', 'xlsx', 'csv'].includes(ext ?? '') ||
    mimeType?.includes('spreadsheet') ||
    mimeType?.includes('csv')
  ) {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  }
  if (['zip', 'tar', 'gz', 'rar'].includes(ext ?? '') || mimeType?.includes('zip')) {
    return <FileArchive className="h-4 w-4 text-amber-500" />;
  }
  if (['js', 'ts', 'tsx', 'json', 'html', 'css'].includes(ext ?? '')) {
    return <FileCode className="h-4 w-4 text-sky-500" />;
  }
  return <File className="h-4 w-4 text-slate-400" />;
}

export function CompanyDocumentsCard() {
  const { files, listLoading, download, busy } = useFiles();

  // Only include ready files
  const activeFiles = files.filter((f) => f.status === 'READY');

  return (
    <Card className="border border-border bg-card shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/60">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Company Documents & Shared Files
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Official policies, company assets, and documents published for your organization.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {activeFiles.length} {activeFiles.length === 1 ? 'file' : 'files'}
        </Badge>
      </CardHeader>

      <CardContent className="pt-3">
        {listLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading company files...
          </div>
        ) : activeFiles.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-xs">
            <p className="font-medium text-foreground">No shared documents yet</p>
            <p className="text-[11px] mt-0.5">
              Files uploaded by your administrators will appear here for easy access.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="p-1.5 rounded-md bg-card border border-border/80 shrink-0">
                    {getFileIcon(file.originalName, file.contentType)}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium text-foreground truncate"
                      title={file.originalName}
                    >
                      {file.originalName}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(file.byteSize)} · {new Date(file.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => download(file.id)}
                  className="h-7 px-2 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 shrink-0 cursor-pointer"
                  title={`Download ${file.originalName}`}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
