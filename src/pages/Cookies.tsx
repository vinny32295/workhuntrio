import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-6 pt-32 pb-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Cookie Policy</h1>
          <p className="text-muted-foreground mb-6">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="prose prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies</h2>
              <p className="text-muted-foreground">
                Cookies are small text files stored on your device when you visit our website. They help us provide a better user experience.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Cookies</h2>
              <p className="text-muted-foreground">
                We use cookies to maintain your session, remember your preferences, and analyze how our service is used.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Types of Cookies</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2">
                <li><strong>Essential Cookies:</strong> Required for the service to function properly</li>
                <li><strong>Authentication Cookies:</strong> Keep you logged in securely</li>
                <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Managing Cookies</h2>
              <p className="text-muted-foreground">
                You can control cookies through your browser settings. Disabling certain cookies may affect the functionality of our service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Contact</h2>
              <p className="text-muted-foreground">
                For questions about our Cookie Policy, contact us at{" "}
                <a href="mailto:support@workhuntr.io" className="text-primary hover:underline">
                  support@workhuntr.io
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Cookies;
