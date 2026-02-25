/**
 * Full-screen loading overlay with orbital spinner.
 */
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-300">
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary dark:bg-[#171717] ring-1 ring-border overflow-hidden p-2.5">
          <img
            src="/logo-80.png"
            alt="X-Ray"
            width={80}
            height={80}
            className="h-full w-full object-contain"
          />
        </div>
        {/* Orbital spinner */}
        <div className="absolute inset-[-4px] rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
      </div>
    </div>
  );
}
