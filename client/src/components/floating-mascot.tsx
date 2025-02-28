import { motion, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";

const expressions = ["(｡◕‿◕｡)", "(◕‿◕✿)", "(｡♥‿♥｡)", "(◠‿◠)", "(*^▽^*)", "(◕ω◕)", "(｡◕‿‿◕｡)", "💮(❀´ ˘ `❀)🌸", "𓇢𓆸", "(*ᴗ͈ˬᴗ͈)ꕤ*.ﾟ", "₍ꕤᐢ..ᐢ₎"];

export default function FloatingMascot() {
  const controls = useAnimation();
  const [expression, setExpression] = useState(expressions[0]);

  useEffect(() => {
    // Define the float animation
    const floatAnimation = {
      y: [0, -10, 0],
      transition: { 
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }
    };

    // Start the animation only once
    let isActive = true;
    if (isActive) {
      controls.start(floatAnimation);
    }

    // Cleanup function to stop animation when component unmounts
    return () => {
      isActive = false;
      controls.stop();
    };
  }, [controls]); // Only depend on controls

  const handleHover = () => {
    setExpression(expressions[Math.floor(Math.random() * expressions.length)]);
    controls.start({
      rotate: [0, -5, 5, 0],
      transition: { duration: 0.3 }
    });
  };

  return (
    <motion.div
      className="fixed bottom-6 left-6 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-md cursor-pointer select-none"
      animate={controls}
      whileHover={{ scale: 1.1 }}
      onHoverStart={handleHover}
    >
      <span className="text-sm" role="img" aria-label="Sakura mascot">
        {expression}
      </span>
    </motion.div>
  );
}