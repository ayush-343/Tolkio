import { useState } from "react";
import { DraftingCompass } from "lucide-react";
import { Link } from "react-router";
import toast from "react-hot-toast";

import useSignup from "../hooks/useSignup";

const SignUpPage = () => {
  // State to hold signup form data
  const [signupData, setSignupData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  //This is how I did it first version, without custom hook
  // const queryClient = useQueryClient(); // Initialize query client

  // // Mutation for signing up the user
  // const {
  //   mutate: signupMutation,
  //   isPending,
  //   error,
  // } = useMutation({
  //   mutationFn: signup,
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["authUser"] }); // Refetch authUser query to update auth state
  //     toast.success("Signup successful!");
  //     // Redirect to the Onboarding page
  //   },
  // });

  //This is the custom hook for signup
  const { isPending, error, signupMutation } = useSignup();

  // Handle signup form submission , when the user submit the form
  const handleSignup = (e) => {
    e.preventDefault();
    if (signupData.password !== signupData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    signupMutation(signupData); // Pass signupData to the mutate function
  };

  return (
    <div
      className="h-screen flex items-center justify-center p-4 sm:p-6 md:p-8"
      data-theme="forest"
    >
      <div className="border border-primary/25 flex flex-col lg:flex-row w-full max-w-5xl mx-auto bg-base-100 rounded-lg">
        {/* SIGNUP FORM - LEFT SIDE */}
        <div className="w-full lg:w-1/2 p-4 sm:p-8 flex flex-col">
          {/* LOGO */}
          <div className="mb-4 flex item-center justify-start gap-2">
            <DraftingCompass className="size-10 text-primary" />
            <span className="text-3xl font-semibold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary tracking-wider">
              Sign Up
            </span>
          </div>
          {/* ERROR MESSAGE IF ANY */}
          {error && (
            <div className=" alert alert-error mb-4 w-full">
              <span>{error.response.data.message}</span>
            </div>
          )}
          <div className="w-full">
            <form onSubmit={handleSignup}>
              <div>
                <h2 className="text-xl font-semibold">Create your account</h2>
                <p className="text-sm opacity-70">
                  Join our community and start connecting with others!
                </p>
                <div className="space-y-4">
                  {/* FULL NAME */}
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text text-lg">Full Name</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full"
                      placeholder="John Doe"
                      value={signupData.fullName}
                      onChange={
                        (e) =>
                          setSignupData({
                            ...signupData,
                            fullName: e.target.value,
                          }) // Update fullName in signupData
                      }
                      required
                    />
                  </div>
                  {/* EMAIL */}
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text text-lg">Email</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full"
                      placeholder="john@gmail.com"
                      value={signupData.email}
                      onChange={
                        (e) =>
                          setSignupData({
                            ...signupData,
                            email: e.target.value,
                          }) // Update email in signupData
                      }
                      required
                    />
                  </div>
                  {/* PASSWORD */}
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text text-lg">Password</span>
                    </label>
                    <input
                      type="password"
                      className="input input-bordered w-full"
                      placeholder="*********"
                      value={signupData.password}
                      onChange={
                        (e) =>
                          setSignupData({
                            ...signupData,
                            password: e.target.value,
                          }) // Update password in signupData
                      }
                      required
                    />
                    <p className="text-sm opacity-70">
                      Your password must be at least 6 characters long.
                    </p>
                  </div>
                  {/* CONFIRM PASSWORD */}
                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text text-lg">Re-enter Password</span>
                    </label>
                    <input
                      type="password"
                      className="input input-bordered w-full"
                      placeholder="*********"
                      value={signupData.confirmPassword}
                      onChange={(e) =>
                        setSignupData({
                          ...signupData,
                          confirmPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  {/* USER AGREEMENT {TODO: link terms and conditions and privacy policy} */}
                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        required
                      />
                      <span className=" text-xs leading-tight">
                        I agree to the{" "}
                        <span className="text-primary hover:underline">
                          Terms and Conditions
                        </span>{" "}
                        and{" "}
                        <span className="text-primary hover:underline">
                          Privacy Policy
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
                <button className="btn btn-primary w-full mt-4" type="submit">
                  {isPending ? "Creating Account..." : "Create Account"}
                </button>
                <div className="text-center mt-4">
                  <p className="text-sm">
                    Already have an account?{" "}
                    <Link to="/login" className="text-primary hover:underline">
                      Log in
                    </Link>
                  </p>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT SIDE - IMAGE */}
        <div className="hidden lg:flex w-full lg:w-1/2 bg-primary/10 items-center justify-center">
          <div className="max-w-md p-8">
            {/* Illustration */}
            <div className="relative aspect-square max-w-sm mx-auto">
              <img
                src="/Halloween_video_call-amico.png"
                alt="Sign up animation"
                className="w-full h-full"
              />
            </div>
            <h2 className="text-center font-bold space-y-4 mt-7">
              Connect, Communicate, Collaborate!
            </h2>
            <p className="text-center opacity-70">
              Connect with friends and the world around you. And improve your
              language skills together.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
