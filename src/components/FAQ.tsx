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
      "Simply upload your resume and set your preferences (role type, work arrangement, location). Our AI scans thousands of jobs across top job boards, scores each match against your skills, and surfaces the best opportunities for you. For each role, we generate a custom-tailored resume and cover letter — you just review and apply.",
  },
  {
    question: "Do I still need to apply myself?",
    answer:
      "Yes — you submit the final applications. WorkHuntr finds the top roles that match your profile, then creates a custom resume and personalized cover letter for each one. This gives you full control while saving hours of manual work on tailoring documents.",
  },
  {
    question: "How does the job matching work?",
    answer:
      "Our AI analyzes your resume to extract your skills, experience, and qualifications. Each job is scored based on how well it matches your profile. We surface only the highest-scoring opportunities so you can focus on roles that are actually a fit.",
  },
  {
    question: "How are my resume and cover letter customized?",
    answer:
      "For each job, our AI rewrites your resume bullets to highlight the most relevant experience and keywords from the job description. We also generate a unique cover letter that speaks directly to the company's needs — dramatically increasing your chances of landing an interview.",
  },
  {
    question: "What job preferences can I set?",
    answer:
      "You can filter by role type (e.g., Product Manager, Software Engineer), work arrangement (remote, hybrid, or in-person), and location (zip code with a custom search radius). You can also target specific companies by adding their career page URLs directly.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. Your resume and personal information are encrypted and never shared with third parties. We only use your data to find jobs and generate tailored application materials — nothing else.",
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
