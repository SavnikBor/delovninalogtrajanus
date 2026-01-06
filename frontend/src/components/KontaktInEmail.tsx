import React from 'react';

interface KontaktInEmailProps {
  kontaktnaOseba: string;
  setKontaktnaOseba: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
}

export default function KontaktInEmail({ kontaktnaOseba, setKontaktnaOseba, email, setEmail }: KontaktInEmailProps) {
  return (
    <>
      <div>
        <label>Kontaktna oseba:</label>
        <input
          type="text"
          className="border p-2 w-full"
          value={kontaktnaOseba}
          onChange={e => setKontaktnaOseba(e.target.value)}
        />
      </div>
      <div>
        <label>Email:</label>
        <input
          type="email"
          className="border p-2 w-full"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
    </>
  );
} 