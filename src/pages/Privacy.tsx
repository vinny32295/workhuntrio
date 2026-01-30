import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-6 pt-32 pb-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
          <p className="text-muted-foreground mb-6">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="prose prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
              <p className="text-muted-foreground">
                We collect information you provide directly, including your name, email address, resume data, and job preferences when you use our service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
              <p className="text-muted-foreground">
                Your information is used to provide our job hunting services, including resume parsing, job matching, and application tracking.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Data Security</h2>
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your personal information from unauthorized access or disclosure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Third-Party Services</h2>
              <p className="text-muted-foreground">
                We may use third-party services for payment processing and analytics. These services have their own privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Your Rights</h2>
              <p className="text-muted-foreground">
                You have the right to access, correct, or delete your personal data. Contact us at support@workhuntr.io for any requests.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Contact Us</h2>
              <p className="text-muted-foreground">
                If you have questions about this Privacy Policy, please contact us at{" "}
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

export default Privacy;
