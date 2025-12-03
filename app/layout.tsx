import Script from "next/script";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-montserrat",
});

export const metadata: Metadata = {
	title: "Mikes Blog Writer",
	description: "Mikes Blog Writer - AI-powered blog writer",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<Script
					src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
					strategy="beforeInteractive"
				/>
			</head>
			<body className={`${montserrat.variable} antialiased`}>{children}</body>
		</html>
	);
}
