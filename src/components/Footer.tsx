import { Crosshair } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-16">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <Crosshair className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">
              work<span className="text-primary">huntr</span>.io
            </span>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
            <a href="#" className="hover:text-foreground transition-colors">Blog</a>
          </div>
          
          <div className="text-sm text-muted-foreground">
            © 2025 workhuntr.io. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
