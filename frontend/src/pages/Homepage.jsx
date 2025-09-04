import React from "react";

const Homepage = () => {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => {
    const fetchUser = async () => {
      const response = await fetch("/api/user");
      const data = await response.json();
      setUser(data);
    };
    fetchUser();
  }, [user]);

  return <div>Homepage</div>;
};

export default Homepage;
