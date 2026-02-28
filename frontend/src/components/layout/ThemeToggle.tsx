import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ThemeToggle() {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const root = window.document.documentElement;
        const initialColorValue = localStorage.getItem('theme');

        if (initialColorValue === 'dark') {
            root.classList.add('dark');
            setIsDark(true);
        } else {
            root.classList.remove('dark');
            setIsDark(false);
        }
    }, []);

    const toggleTheme = () => {
        const root = window.document.documentElement;
        const newTheme = isDark ? 'light' : 'dark';

        if (newTheme === 'dark') {
            root.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }

        setIsDark(!isDark);
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-xl h-10 w-10 border bg-background/50 hover:bg-background/80 transition-all"
            aria-label="Toggle Theme"
        >
            {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" />
            ) : (
                <Moon className="h-4 w-4 text-slate-500" />
            )}
        </Button>
    );
}
