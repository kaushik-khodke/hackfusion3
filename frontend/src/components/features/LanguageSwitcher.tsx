import React from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
    { code: 'mr', name: 'मराठी', flag: '🇮🇳' },
  ]

  const changeLanguage = (lng: string) => {
    if (i18n && typeof i18n.changeLanguage === 'function') {
      i18n.changeLanguage(lng)
      localStorage.setItem('language', lng)
    }
  }

  const currentLanguage = i18n?.language || 'en'

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
        <Globe className="w-4 h-4" />
        <span className="text-sm">
          {languages.find(l => l.code === currentLanguage)?.flag || '🌐'}
        </span>
      </button>
      <div className="absolute right-0 mt-2 w-48 bg-card border rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl ${
              currentLanguage === lang.code ? 'bg-primary/10 text-primary' : ''
            }`}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.name}
          </button>
        ))}
      </div>
    </div>
  )
}
