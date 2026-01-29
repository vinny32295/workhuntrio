import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does WorkHuntr work?",
    answer:
      "Simply upload your resume, select your preferences (role type, remote/hybrid/in-person, location and search radius), and we handle the rest. Our AI scans thousands of jobs, scores each match against your skills, and automatically applies to the best fits — complete with a custom-tailored resume and cover letter for each application.",
  },
  {
    question: "Do I need to apply to jobs myself?",
    answer:
      "Nope! That's the whole point. WorkHuntr applies on your behalf. When we find a strong match, we generate a customized resume and cover letter tailored to the job description and submit your application directly. You just sit back and wait for interviews.",
  },
  {
    question: "How does the job matching work?",
    answer:
      "Our AI analyzes your resume to extract your skills, experience, and qualifications. Each job is scored based on how well it matches your profile. Only high-scoring matches trigger automatic applications — so you're not wasting time on roles that aren't a fit.",
  },
  {
    question: "How are my resume and cover letter customized?",
    answer:
      "For each application, our AI rewrites your resume bullets to highlight the most relevant experience and keywords from the job description. We also generate a unique cover letter that speaks directly to the company's needs — increasing your chances of getting noticed.",
  },
  {
    question: "What job preferences can I set?",
    answer:
      "You can filter by role type (e.g., Product Manager, Software Engineer), work arrangement (remote, hybrid, or in-person), and location (zip code with a custom search radius). We only apply to jobs that match all your criteria.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. Your resume and personal information are encrypted and never shared with third parties. We only use your data to find jobs and submit applications on your behalf — nothing else.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes! No long-term contracts. Upgrade, downgrade, or cancel from your account settings at any time. If you cancel, you keep access until the end of your billing period.",
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
