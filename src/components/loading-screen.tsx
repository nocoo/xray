/**
 * Full-screen loading overlay with orbital spinner.
 */
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-300">
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
          <span className="text-2xl font-bold text-primary font-mono">X</span>
        </div>
        {/* Orbital spinner */}
        <div className="absolute inset-[-4px] rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
      </div>
    </div>
  );
}
