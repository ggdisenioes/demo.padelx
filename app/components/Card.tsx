"use client";

import type React from "react";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export default function Card({ children, title, className = "" }: CardProps) {
  return (
    <div
      className={`card-enter bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}
    >
      {title && (
        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">{title}</h3>
      )}

      <div>{children}</div>
    </div>
  );
}
