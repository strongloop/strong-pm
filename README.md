# strong-deploy

Architecture:

        ------
        node
          cluster | net | ...
        ------------------
        strong-   |
        cluster-  |
        control   |
        ------------------------
        strong-
        supervisor
           uses: fs, syslog, run-time control, strong-agent, s-c-c, signals, ...
        
           XXX the control channel/pipe should not be in cluster-control!
        ---------------------------------
            upstart      |     strong-deploy    
        how to restart   |   git receives, and SIGHUPs to trigger chdir/and
        becomes your     |   worker restart
        problem, but not |
        a problem if     |
        you deploy in
        containers
