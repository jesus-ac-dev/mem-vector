import {
    criarGrupo,
    convidar,
    aceitarConvite,
    recusarConvite,
    sair,
} from '@/modules/grupos/grupos.actions';
import { listarMeusGrupos, convitesParaMim } from '@/modules/grupos/grupos.service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function GruposPage() {
    const [grupos, convites] = await Promise.all([listarMeusGrupos(), convitesParaMim()]);

    return (
        <div className="mx-auto h-full max-w-2xl space-y-8 overflow-y-auto p-6">
            <div>
                <h1 className="mb-4 text-2xl font-semibold tracking-tight">Grupos</h1>
                <form action={criarGrupo} className="flex flex-col gap-2 rounded-md border p-4">
                    <Input name="nome" placeholder="Nome do grupo" required />
                    <Input name="descricao" placeholder="Descrição (opcional)" />
                    <Button type="submit" className="self-start">
                        Criar grupo
                    </Button>
                </form>
            </div>

            {convites.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                        Convites pendentes
                    </h2>
                    {convites.map((c) => (
                        <div
                            key={c.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                        >
                            <span>Foste convidado para um grupo</span>
                            <div className="flex gap-2">
                                <form action={aceitarConvite}>
                                    <Input type="hidden" name="conviteId" defaultValue={c.id} />
                                    <Button type="submit" size="sm">
                                        Aceitar
                                    </Button>
                                </form>
                                <form action={recusarConvite}>
                                    <Input type="hidden" name="conviteId" defaultValue={c.id} />
                                    <Button type="submit" size="sm" variant="ghost">
                                        Recusar
                                    </Button>
                                </form>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">Os meus grupos</h2>
                {grupos.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        Ainda não pertences a nenhum grupo.
                    </p>
                )}
                {grupos.map((g) => (
                    <div key={g.id} className="space-y-3 rounded-md border p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="font-medium">{g.nome}</p>
                                {g.descricao && (
                                    <p className="text-sm text-muted-foreground">{g.descricao}</p>
                                )}
                            </div>
                            <form action={sair}>
                                <Input type="hidden" name="grupoId" defaultValue={g.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                    Sair
                                </Button>
                            </form>
                        </div>
                        <form action={convidar} className="flex gap-2">
                            <Input type="hidden" name="grupoId" defaultValue={g.id} />
                            <Input
                                name="email"
                                type="email"
                                placeholder="Convidar por email"
                                className="flex-1"
                                required
                            />
                            <Button type="submit" size="sm" variant="outline">
                                Convidar
                            </Button>
                        </form>
                    </div>
                ))}
            </section>
        </div>
    );
}
