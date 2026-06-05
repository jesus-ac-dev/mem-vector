'use client';

import { useRouter } from 'next/navigation';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Version {
    id: string;
    createdAt: string;
    author: string;
}

interface VersionPickerProps {
    versions: Version[];
    slug: string;
    currentBase?: string;
    /** When true, keeps ?view=history in the URL while changing the base version. */
    keepView?: boolean;
}

export function VersionPicker({ versions, slug, currentBase, keepView }: VersionPickerProps) {
    const router = useRouter();

    // Default: compare with the previous version (index 1 in the sorted list)
    const defaultBase = versions[0]?.id ?? '';
    const value = currentBase ?? defaultBase;

    function handleChange(id: string) {
        const params = new URLSearchParams();
        if (keepView) params.set('view', 'history');
        params.set('base', id);
        router.push(`/knowledge/${slug}?${params.toString()}`);
    }

    return (
        <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Comparar a versão atual com:</p>
            <Select value={value} onValueChange={handleChange}>
                <SelectTrigger className="w-64 text-xs">
                    <SelectValue placeholder="Escolher versão..." />
                </SelectTrigger>
                <SelectContent>
                    {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                            <span className="font-mono">
                                {new Date(v.createdAt).toLocaleString('pt-PT', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                })}
                            </span>
                            <span className="ml-2 text-muted-foreground">{v.author}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
