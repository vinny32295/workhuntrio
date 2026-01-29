import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does WorkHuntr find jobs for me?",
    answer:
      "WorkHuntr uses AI-powered search to scan thousands of job boards, company career pages, and ATS platforms in real-time. We match listings to your skills, experience, and preferences — then deliver only the most relevant opportunities directly to you.",
  },
  {
    question: "Do I need to apply manually?",
    answer:
      "Yes, you still apply to jobs yourself. WorkHuntr handles the discovery, analysis, and resume tailoring — but we believe the final application should come from you. This keeps you in control and ensures authenticity.",
  },
  {
    question: "How is my resume tailored for each job?",
    answer:
      "Our AI analyzes each job description to identify key requirements and keywords. It then rewrites your resume bullets to highlight the most relevant experience, increasing your chances of passing ATS filters and catching a recruiter's eye.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. Your resume and personal information are encrypted and never shared with third parties. We only use your data to find and match jobs for you — nothing else.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes! There are no long-term contracts. You can upgrade, downgrade, or cancel your subscription at any time from your account settings. If you cancel, you'll retain access until the end of your billing period.",
  },
  {
    question: "What types of jobs does WorkHuntr support?",
    answer:
      "We specialize in remote and hybrid roles across tech, operations, product, marketing, and more. You can customize your job preferences to target specific industries, roles, and locations.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Frequently Asked{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
              Questions
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about WorkHuntr
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="glass-card border border-white/10 rounded-xl px-6 data-[state=open]:border-primary/50 transition-colors"
              >
                <AccordionTrigger className="text-left text-lg font-medium hover:text-primary transition-colors py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
