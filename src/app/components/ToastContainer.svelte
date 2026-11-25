<script lang="ts">
  import type { ToastMessage } from '../atelier/types';

  interface Props {
    toasts: readonly ToastMessage[];
  }

  let { toasts }: Props = $props();

  const variantClasses: Record<ToastMessage['variant'], string> = {
    success:
      'bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 border-emerald-500/40',
    info: 'bg-obsidian-900 dark:bg-obsidian-800 text-white border-white/15',
    danger: 'bg-rose-600 text-white border-rose-400/40',
  };
</script>

<div
  class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"
  role="status"
  aria-live="polite"
>
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium shadow-2xl transition-all duration-300 {variantClasses[
        toast.variant
      ]}"
    >
      <span
        class="w-1.5 h-1.5 rounded-full {toast.variant === 'danger'
          ? 'bg-white'
          : 'bg-emerald-400'}"
      ></span>
      <span>{toast.message}</span>
    </div>
  {/each}
</div>
